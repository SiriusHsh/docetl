from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.app.app_factory import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch) -> TestClient:
    home_dir = tmp_path / "docetl_home"
    home_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DOCETL_HOME_DIR", str(home_dir))
    monkeypatch.setenv("DOCETL_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("DOCETL_BOOTSTRAP_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("DOCETL_BOOTSTRAP_ADMIN_PASSWORD", "adminpass123")
    monkeypatch.setenv("DOCETL_DISABLE_SCHEDULER", "true")

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient, username: str) -> tuple[str, str]:
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"], resp.json()["user"]["id"]


def _login_admin(client: TestClient) -> str:
    resp = client.post(
        "/auth/login",
        json={"username": "admin", "password": "adminpass123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


def test_pipelines_rbac(client: TestClient) -> None:
    alice_token, alice_id = _register(client, "alice")
    bob_token, _ = _register(client, "bob")
    admin_token = _login_admin(client)

    grant = client.put(
        f"/users/{alice_id}/namespaces/project_x",
        headers=_auth_headers(admin_token),
    )
    assert grant.status_code == 204, grant.text

    client.cookies.clear()
    unauth_list = client.get("/pipelines?namespace=project_x")
    assert unauth_list.status_code == 401

    alice_list = client.get("/pipelines?namespace=project_x", headers=_auth_headers(alice_token))
    assert alice_list.status_code == 200, alice_list.text

    bob_forbidden = client.get("/pipelines?namespace=project_x", headers=_auth_headers(bob_token))
    assert bob_forbidden.status_code == 403

    created = client.post(
        "/pipelines",
        headers=_auth_headers(alice_token),
        json={"namespace": "project_x", "name": "Demo Pipeline", "state": {}},
    )
    assert created.status_code == 201, created.text
    pipeline_id = created.json()["id"]

    bob_get = client.get(
        f"/pipelines/{pipeline_id}?namespace=project_x",
        headers=_auth_headers(bob_token),
    )
    assert bob_get.status_code == 403

    bad_id = client.get(
        "/pipelines/not-a-uuid?namespace=project_x",
        headers=_auth_headers(alice_token),
    )
    assert bad_id.status_code == 400


def test_filesystem_path_is_scoped_to_namespace(client: TestClient) -> None:
    alice_token, alice_id = _register(client, "alice")
    bob_token, _ = _register(client, "bob")
    admin_token = _login_admin(client)

    grant = client.put(
        f"/users/{alice_id}/namespaces/project_x",
        headers=_auth_headers(admin_token),
    )
    assert grant.status_code == 204, grant.text

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])

    alice_file = home_dir / ".docetl" / "project_x" / "files" / "data.json"
    alice_file.parent.mkdir(parents=True, exist_ok=True)
    alice_file.write_text('{"hello": "world"}')

    alice_read = client.get(
        f"/fs/read-file?path={alice_file}",
        headers=_auth_headers(alice_token),
    )
    assert alice_read.status_code == 200, alice_read.text
    assert "world" in alice_read.text

    bob_read = client.get(
        f"/fs/read-file?path={alice_file}",
        headers=_auth_headers(bob_token),
    )
    assert bob_read.status_code == 403

    outside_file = home_dir / "secret.txt"
    outside_file.write_text("top-secret")
    outside_read = client.get(
        f"/fs/read-file?path={outside_file}",
        headers=_auth_headers(alice_token),
    )
    assert outside_read.status_code == 400

    platform_db = home_dir / ".docetl" / "_platform" / "platform.db"
    platform_read = client.get(
        f"/fs/read-file?path={platform_db}",
        headers=_auth_headers(alice_token),
    )
    assert platform_read.status_code == 403


def test_filesystem_legacy_user_path_aliases_to_public_business(client: TestClient) -> None:
    token, _ = _register(client, "hsh")

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])
    public_file = home_dir / ".docetl" / "public_business" / "files" / "data.json"
    public_file.parent.mkdir(parents=True, exist_ok=True)
    public_file.write_text('{"hello": "world"}')

    legacy_path = home_dir / ".docetl" / "hsh" / "files" / "data.json"
    legacy_read = client.get(
        f"/fs/read-file?path={legacy_path}",
        headers=_auth_headers(token),
    )
    assert legacy_read.status_code == 200, legacy_read.text
    assert "world" in legacy_read.text


def test_pipeline_store_normalizes_legacy_namespace_state(client: TestClient) -> None:
    token, _ = _register(client, "hsh")

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])
    pipeline_id = str(uuid.uuid4())
    store_path = (
        home_dir
        / ".docetl"
        / "public_business"
        / "pipelines"
        / "store"
        / f"{pipeline_id}.json"
    )
    store_path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.utcnow().isoformat()
    store_path.write_text(
        json.dumps(
            {
                "id": pipeline_id,
                "name": "legacy-pipeline",
                "namespace": "hsh",
                "description": None,
                "created_at": now,
                "updated_at": now,
                "last_run_status": None,
                "last_run_at": None,
                "state": {
                    "namespace": "hsh",
                    "currentFile": {
                        "name": "input",
                        "path": "docetl_data/.docetl/hsh/data_center/datasets/user/input.json",
                    },
                    "output": {
                        "path": "docetl_data/.docetl/hsh/pipelines/demo/intermediates/op.json",
                        "operationId": "op-1",
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    listed = client.get(
        "/pipelines?namespace=public_business",
        headers=_auth_headers(token),
    )
    assert listed.status_code == 200, listed.text
    listed_item = next(item for item in listed.json() if item["id"] == pipeline_id)
    assert listed_item["namespace"] == "public_business"

    loaded = client.get(
        f"/pipelines/{pipeline_id}?namespace=public_business",
        headers=_auth_headers(token),
    )
    assert loaded.status_code == 200, loaded.text
    payload = loaded.json()
    assert payload["namespace"] == "public_business"
    assert payload["state"]["namespace"] == "public_business"
    assert "/.docetl/public_business/" in payload["state"]["currentFile"]["path"]
    assert "/.docetl/public_business/" in payload["state"]["output"]["path"]

    on_disk = json.loads(store_path.read_text(encoding="utf-8"))
    assert on_disk["namespace"] == "public_business"
    assert on_disk["state"]["namespace"] == "public_business"
    assert "/.docetl/public_business/" in on_disk["state"]["currentFile"]["path"]


def test_websocket_requires_token_and_namespace_access(client: TestClient) -> None:
    alice_token, alice_id = _register(client, "alice")
    bob_token, _ = _register(client, "bob")
    admin_token = _login_admin(client)

    grant = client.put(
        f"/users/{alice_id}/namespaces/project_x",
        headers=_auth_headers(admin_token),
    )
    assert grant.status_code == 204, grant.text

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])
    yaml_path = home_dir / ".docetl" / "project_x" / "pipelines" / "configs" / "invalid.yaml"
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    yaml_path.write_text("{}")

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/run_pipeline/project_x") as ws:
            ws.send_json({"yaml_config": str(yaml_path)})

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/run_pipeline/project_x?token={bob_token}") as ws:
            ws.send_json({"yaml_config": str(yaml_path)})

    with client.websocket_connect(f"/ws/run_pipeline/project_x?token={alice_token}") as ws:
        ws.send_json({"yaml_config": str(yaml_path)})
        message = ws.receive_json()
        assert message["type"] == "error"
