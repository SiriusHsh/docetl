from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app.app_factory import create_app


@pytest.fixture()
def client(tmp_path, monkeypatch) -> TestClient:
    home_dir = tmp_path / "docetl_home"
    home_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("DOCETL_HOME_DIR", str(home_dir))
    monkeypatch.setenv("DOCETL_AUTH_SECRET", "test-secret")
    monkeypatch.setenv("DOCETL_DISABLE_SCHEDULER", "true")

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_user(client: TestClient, username: str) -> tuple[str, str]:
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]
    me = client.get("/auth/me", headers=_auth_headers(token))
    assert me.status_code == 200, me.text
    namespace = me.json()["memberships"][0]["namespace"]
    return token, namespace


def _create_pipeline(client: TestClient, token: str, namespace: str) -> str:
    resp = client.post(
        "/pipelines",
        headers=_auth_headers(token),
        json={
            "namespace": namespace,
            "name": "Test Pipeline",
            "state": {},
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_deployment_crud(client: TestClient) -> None:
    token, namespace = _register_user(client, "deployuser")
    pipeline_id = _create_pipeline(client, token, namespace)

    create_resp = client.post(
        "/deployments",
        headers=_auth_headers(token),
        json={
            "namespace": namespace,
            "name": "Daily Run",
            "pipeline_id": pipeline_id,
            "enabled": True,
            "schedule_type": "interval",
            "schedule": {"every": 1, "unit": "hours"},
            "timezone": "UTC",
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    deployment_id = create_resp.json()["id"]

    list_resp = client.get(
        f"/deployments?namespace={namespace}",
        headers=_auth_headers(token),
    )
    assert list_resp.status_code == 200, list_resp.text
    assert any(item["id"] == deployment_id for item in list_resp.json())

    patch_resp = client.patch(
        f"/deployments/{deployment_id}",
        headers=_auth_headers(token),
        json={"namespace": namespace, "enabled": False},
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["enabled"] is False

    delete_resp = client.delete(
        f"/deployments/{deployment_id}",
        headers=_auth_headers(token),
    )
    assert delete_resp.status_code == 204, delete_resp.text
