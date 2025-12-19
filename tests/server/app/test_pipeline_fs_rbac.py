from __future__ import annotations

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

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register(client: TestClient, username: str) -> str:
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


def test_pipelines_rbac(client: TestClient) -> None:
    alice_token = _register(client, "alice")
    bob_token = _register(client, "bob")

    client.cookies.clear()
    unauth_list = client.get("/pipelines?namespace=alice")
    assert unauth_list.status_code == 401

    alice_list = client.get("/pipelines?namespace=alice", headers=_auth_headers(alice_token))
    assert alice_list.status_code == 200, alice_list.text

    bob_forbidden = client.get("/pipelines?namespace=alice", headers=_auth_headers(bob_token))
    assert bob_forbidden.status_code == 403

    created = client.post(
        "/pipelines",
        headers=_auth_headers(alice_token),
        json={"namespace": "alice", "name": "Demo Pipeline", "state": {}},
    )
    assert created.status_code == 201, created.text
    pipeline_id = created.json()["id"]

    bob_get = client.get(
        f"/pipelines/{pipeline_id}?namespace=alice",
        headers=_auth_headers(bob_token),
    )
    assert bob_get.status_code == 403

    bad_id = client.get(
        "/pipelines/not-a-uuid?namespace=alice",
        headers=_auth_headers(alice_token),
    )
    assert bad_id.status_code == 400


def test_filesystem_path_is_scoped_to_namespace(client: TestClient) -> None:
    alice_token = _register(client, "alice")
    bob_token = _register(client, "bob")

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])

    alice_file = home_dir / ".docetl" / "alice" / "files" / "data.json"
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


def test_websocket_requires_token_and_namespace_access(client: TestClient) -> None:
    alice_token = _register(client, "alice")
    bob_token = _register(client, "bob")

    import os

    home_dir = Path(os.environ["DOCETL_HOME_DIR"])
    yaml_path = home_dir / ".docetl" / "alice" / "pipelines" / "configs" / "invalid.yaml"
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    yaml_path.write_text("{}")

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/run_pipeline/alice") as ws:
            ws.send_json({"yaml_config": str(yaml_path)})

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/run_pipeline/alice?token={bob_token}") as ws:
            ws.send_json({"yaml_config": str(yaml_path)})

    with client.websocket_connect(f"/ws/run_pipeline/alice?token={alice_token}") as ws:
        ws.send_json({"yaml_config": str(yaml_path)})
        message = ws.receive_json()
        assert message["type"] == "error"
