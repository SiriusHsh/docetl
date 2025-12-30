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
    monkeypatch.setenv("DOCETL_BOOTSTRAP_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("DOCETL_BOOTSTRAP_ADMIN_PASSWORD", "adminpass123")

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_group_access_grants_namespace_role(client: TestClient) -> None:
    admin_login = client.post(
        "/auth/login",
        json={"username": "admin", "password": "adminpass123"},
    )
    assert admin_login.status_code == 200, admin_login.text
    admin_token = admin_login.json()["token"]

    user_register = client.post(
        "/auth/register",
        json={"username": "bob", "password": "password123"},
    )
    assert user_register.status_code == 201, user_register.text
    bob_token = user_register.json()["token"]
    bob_id = user_register.json()["user"]["id"]

    create_group = client.post(
        "/groups",
        headers=_auth_headers(admin_token),
        json={"name": "Core Devs", "description": "Core developers"},
    )
    assert create_group.status_code == 201, create_group.text
    group_id = create_group.json()["id"]

    add_member = client.post(
        f"/groups/{group_id}/members",
        headers=_auth_headers(admin_token),
        json={"user_id": bob_id},
    )
    assert add_member.status_code == 204, add_member.text

    set_access = client.put(
        f"/groups/{group_id}/namespace-access/project_x",
        headers=_auth_headers(admin_token),
        json={"role": "viewer"},
    )
    assert set_access.status_code == 204, set_access.text

    bob_me = client.get("/auth/me", headers=_auth_headers(bob_token))
    assert bob_me.status_code == 200, bob_me.text
    assert any(m["namespace"] == "project_x" for m in bob_me.json()["memberships"])

    list_pipelines = client.get(
        "/pipelines?namespace=project_x",
        headers=_auth_headers(bob_token),
    )
    assert list_pipelines.status_code == 200, list_pipelines.text

    remove_member = client.delete(
        f"/groups/{group_id}/members/{bob_id}",
        headers=_auth_headers(admin_token),
    )
    assert remove_member.status_code == 204, remove_member.text

    forbidden = client.get(
        "/pipelines?namespace=project_x",
        headers=_auth_headers(bob_token),
    )
    assert forbidden.status_code == 403, forbidden.text
