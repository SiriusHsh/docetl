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
    monkeypatch.setenv("DOCETL_DISABLE_SCHEDULER", "true")

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login_admin(client: TestClient) -> str:
    response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "adminpass123"},
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


def test_groups_endpoints_are_disabled(client: TestClient) -> None:
    admin_token = _login_admin(client)

    list_groups = client.get("/groups", headers=_auth_headers(admin_token))
    assert list_groups.status_code == 404, list_groups.text

    create_group = client.post(
        "/groups",
        headers=_auth_headers(admin_token),
        json={"name": "Core Devs", "description": "Core developers"},
    )
    assert create_group.status_code == 404, create_group.text


def test_scenario_group_assignment_endpoints_are_disabled(client: TestClient) -> None:
    admin_token = _login_admin(client)

    list_groups = client.get(
        "/scenarios/public_business/groups",
        headers=_auth_headers(admin_token),
    )
    assert list_groups.status_code == 404, list_groups.text

    assign_group = client.put(
        "/scenarios/public_business/groups/any-group",
        headers=_auth_headers(admin_token),
        json={"role": "editor"},
    )
    assert assign_group.status_code == 404, assign_group.text
