from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app.app_factory import create_app
from server.app.run_manager import register_run, unregister_run
from server.app.storage import metadata_db
from server.app.storage.paths import get_platform_db_path


@pytest.fixture()
def client(tmp_path, monkeypatch) -> TestClient:
    home_dir = tmp_path / "docetl_home"
    home_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DOCETL_HOME_DIR", str(home_dir))
    monkeypatch.setenv("DOCETL_AUTH_SECRET", "test-secret")

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_user(client: TestClient, username: str) -> tuple[str, str, str]:
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]

    me = client.get("/auth/me", headers=_auth_headers(token))
    assert me.status_code == 200, me.text
    me_json = me.json()
    namespace = me_json["memberships"][0]["namespace"]
    user_id = me_json["user"]["id"]
    return token, user_id, namespace


def _create_run(namespace: str, user_id: str) -> str:
    conn = metadata_db.get_connection(get_platform_db_path())
    try:
        row = metadata_db.create_run(
            conn,
            namespace=namespace,
            trigger="manual",
            status="running",
            pipeline_id=None,
            pipeline_name="test-pipeline",
            triggered_by_user_id=user_id,
        )
        conn.commit()
        return row.id
    finally:
        conn.close()


def test_list_runs_and_summary(client: TestClient) -> None:
    token, user_id, namespace = _register_user(client, "alice")
    run_id = _create_run(namespace, user_id)

    resp = client.get(
        f"/runs?namespace={namespace}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    runs = resp.json()
    assert any(run["id"] == run_id for run in runs)

    summary = client.get(
        f"/runs/summary?namespace={namespace}",
        headers=_auth_headers(token),
    )
    assert summary.status_code == 200, summary.text
    summary_json = summary.json()
    assert summary_json["total"] >= 1
    assert summary_json["running"] >= 1


def test_run_access_and_cancel(client: TestClient) -> None:
    token_alice, user_id, namespace = _register_user(client, "alice2")
    token_bob, _, _ = _register_user(client, "bob2")

    run_id = _create_run(namespace, user_id)

    forbidden = client.get(f"/runs/{run_id}", headers=_auth_headers(token_bob))
    assert forbidden.status_code == 403

    not_cancellable = client.post(
        f"/runs/{run_id}/cancel",
        headers=_auth_headers(token_alice),
    )
    assert not_cancellable.status_code == 409

    register_run(run_id, lambda: None)
    try:
        cancel = client.post(
            f"/runs/{run_id}/cancel",
            headers=_auth_headers(token_alice),
        )
        assert cancel.status_code == 202, cancel.text
        assert cancel.json()["status"] == "cancelling"
    finally:
        unregister_run(run_id)
