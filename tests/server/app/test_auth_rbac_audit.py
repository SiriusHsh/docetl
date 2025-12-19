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


def test_register_login_logout_me(client: TestClient) -> None:
    resp = client.post(
        "/auth/register",
        json={"username": "alice", "password": "password123", "email": "alice@example.com"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]

    me = client.get("/auth/me", headers=_auth_headers(token))
    assert me.status_code == 200, me.text
    me_json = me.json()
    assert me_json["user"]["username"] == "alice"
    assert any(m["role"] == "namespace_admin" for m in me_json["memberships"])

    logout = client.post("/auth/logout", headers=_auth_headers(token))
    assert logout.status_code == 204

    me_after = client.get("/auth/me", headers=_auth_headers(token))
    assert me_after.status_code == 401


def test_admin_rbac_and_audit_logs(client: TestClient) -> None:
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

    # Non-admin cannot list users
    forbidden = client.get("/users", headers=_auth_headers(bob_token))
    assert forbidden.status_code == 403

    # Admin can list users
    users = client.get("/users", headers=_auth_headers(admin_token))
    assert users.status_code == 200, users.text
    assert any(u["username"] == "admin" for u in users.json())

    # Admin can create a user and assign namespace role
    create_user = client.post(
        "/users",
        headers=_auth_headers(admin_token),
        json={"username": "charlie", "password": "password123", "platform_role": "user"},
    )
    assert create_user.status_code == 201, create_user.text
    created_user_id = create_user.json()["id"]

    set_membership = client.put(
        f"/users/{created_user_id}/namespaces/project_x",
        headers=_auth_headers(admin_token),
        json={"role": "editor"},
    )
    assert set_membership.status_code == 204

    memberships = client.get(
        f"/users/{created_user_id}/memberships",
        headers=_auth_headers(admin_token),
    )
    assert memberships.status_code == 200, memberships.text
    assert any(m["namespace"] == "project_x" and m["role"] == "editor" for m in memberships.json())

    # Audit logs are admin-only
    forbidden_audit = client.get("/audit-logs", headers=_auth_headers(bob_token))
    assert forbidden_audit.status_code == 403

    audit = client.get("/audit-logs", headers=_auth_headers(admin_token))
    assert audit.status_code == 200, audit.text
    actions = [entry["action"] for entry in audit.json()]
    assert "auth.login" in actions
    assert "user.create" in actions
    assert "membership.upsert" in actions

