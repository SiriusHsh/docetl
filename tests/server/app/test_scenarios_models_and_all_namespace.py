from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app.app_factory import create_app
from server.app.storage import metadata_db
from server.app.storage.paths import get_platform_db_path


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


def _register_user(client: TestClient, username: str) -> tuple[str, str]:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    token = response.json()["token"]
    user_id = response.json()["user"]["id"]
    return token, user_id


def _login_admin(client: TestClient) -> str:
    response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "adminpass123"},
    )
    assert response.status_code == 200, response.text
    return response.json()["token"]


def test_scenarios_api_and_membership_display_name(client: TestClient) -> None:
    admin_token = _login_admin(client)
    bob_token, bob_id = _register_user(client, "bob")

    forbidden = client.post(
        "/scenarios",
        headers=_auth_headers(bob_token),
        json={"display_name": "可信数字人"},
    )
    assert forbidden.status_code == 403

    create = client.post(
        "/scenarios",
        headers=_auth_headers(admin_token),
        json={"display_name": "可信数字人", "description": "测试场景"},
    )
    assert create.status_code == 201, create.text
    scenario = create.json()
    assert scenario["display_name"] == "可信数字人"
    assert scenario["namespace"].startswith("scenario")

    assign = client.put(
        f"/scenarios/{scenario['namespace']}/users/{bob_id}",
        headers=_auth_headers(admin_token),
    )
    assert assign.status_code == 204, assign.text

    scenario_users = client.get(
        f"/scenarios/{scenario['namespace']}/users",
        headers=_auth_headers(admin_token),
    )
    assert scenario_users.status_code == 200, scenario_users.text
    assert any(
        item["user_id"] == bob_id and item["role"] == "editor"
        for item in scenario_users.json()
    )

    mine = client.get("/scenarios/mine", headers=_auth_headers(bob_token))
    assert mine.status_code == 200, mine.text
    assert any(
        item["namespace"] == scenario["namespace"]
        and item["display_name"] == "可信数字人"
        for item in mine.json()
    )

    me = client.get("/auth/me", headers=_auth_headers(bob_token))
    assert me.status_code == 200, me.text
    assert any("display_name" in item for item in me.json()["memberships"])


def test_all_namespace_query_admin_only(client: TestClient) -> None:
    admin_token = _login_admin(client)
    alice_token, alice_id = _register_user(client, "alice")
    bob_token, bob_id = _register_user(client, "bobby")

    conn = metadata_db.get_connection(get_platform_db_path())
    try:
        metadata_db.create_run(
            conn,
            namespace="public_business",
            trigger="manual",
            status="running",
            pipeline_id="pipe-a",
            pipeline_name="PipeA",
            triggered_by_user_id=alice_id,
        )
        metadata_db.create_run(
            conn,
            namespace="public_business",
            trigger="manual",
            status="failed",
            pipeline_id="pipe-b",
            pipeline_name="PipeB",
            triggered_by_user_id=bob_id,
        )
        conn.commit()
    finally:
        conn.close()

    admin_runs = client.get("/runs?namespace=__all__", headers=_auth_headers(admin_token))
    assert admin_runs.status_code == 200, admin_runs.text
    assert len(admin_runs.json()) >= 2

    admin_summary = client.get(
        "/runs/summary?namespace=__all__",
        headers=_auth_headers(admin_token),
    )
    assert admin_summary.status_code == 200, admin_summary.text
    assert admin_summary.json()["total"] >= 2

    forbidden = client.get("/runs?namespace=__all__", headers=_auth_headers(alice_token))
    assert forbidden.status_code == 403


def test_model_registry_rbac(client: TestClient) -> None:
    admin_token = _login_admin(client)
    user_token, _ = _register_user(client, "model_user")

    create = client.post(
        "/models",
        headers=_auth_headers(admin_token),
        json={
            "name": "平台默认模型",
            "model_id": "gpt-4o-mini",
            "protocol": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-test-key",
            "tags": ["default"],
            "description": "test",
            "status": "active",
            "params": {"temperature": 0.2},
        },
    )
    assert create.status_code == 201, create.text
    model_id = create.json()["id"]

    list_user = client.get("/models", headers=_auth_headers(user_token))
    assert list_user.status_code == 200, list_user.text
    assert any(item["id"] == model_id for item in list_user.json())

    forbidden_create = client.post(
        "/models",
        headers=_auth_headers(user_token),
        json={
            "name": "forbidden",
            "model_id": "gpt-4.1",
            "protocol": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-forbidden",
            "status": "active",
        },
    )
    assert forbidden_create.status_code == 403

    forbidden_inactive = client.get(
        "/models?include_inactive=true",
        headers=_auth_headers(user_token),
    )
    assert forbidden_inactive.status_code == 403

    update = client.patch(
        f"/models/{model_id}",
        headers=_auth_headers(admin_token),
        json={
            "id": model_id,
            "name": "平台默认模型",
            "model_id": "gpt-4o-mini",
            "protocol": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-test-key",
            "tags": ["default"],
            "description": "test",
            "status": "inactive",
        },
    )
    assert update.status_code == 200, update.text

    list_user_after = client.get("/models", headers=_auth_headers(user_token))
    assert list_user_after.status_code == 200, list_user_after.text
    assert all(item["id"] != model_id for item in list_user_after.json())


def test_legacy_user_named_namespace_is_migrated_to_public_business(client: TestClient) -> None:
    _ = _login_admin(client)
    _, legacy_user_id = _register_user(client, "legacy_user")

    conn = metadata_db.get_connection(get_platform_db_path())
    try:
        metadata_db.upsert_membership(
            conn,
            user_id=legacy_user_id,
            namespace="legacy_user",
        )
        metadata_db.create_run(
            conn,
            namespace="legacy_user",
            trigger="manual",
            status="running",
            pipeline_id="legacy-pipe",
            pipeline_name="LegacyPipe",
            triggered_by_user_id=legacy_user_id,
        )

        admin_lookup = metadata_db.get_user_by_username(conn, "admin")
        assert admin_lookup is not None
        admin_id = admin_lookup[0].id
        metadata_db.create_namespace_catalog_entry(
            conn,
            namespace="trusted_scenario",
            display_name="可信数字人",
            created_by_user_id=admin_id,
        )

        conn.execute(
            "DELETE FROM platform_meta WHERE key = ?",
            ("migration_legacy_to_public_business_v2",),
        )
        metadata_db.init_schema(conn)
        conn.commit()

        namespaces = {
            row.namespace
            for row in metadata_db.list_namespace_catalog(
                conn,
                include_inactive=True,
            )
        }
        assert "legacy_user" not in namespaces
        assert "public_business" in namespaces
        assert "trusted_scenario" in namespaces

        assert (
            metadata_db.get_namespace_role(
                conn,
                user_id=legacy_user_id,
                namespace="public_business",
            )
            == "editor"
        )
        assert (
            metadata_db.get_namespace_role(
                conn,
                user_id=legacy_user_id,
                namespace="legacy_user",
            )
            is None
        )

        runs = metadata_db.list_runs(
            conn,
            namespace="public_business",
            limit=100,
            offset=0,
        )
        assert any(run.pipeline_id == "legacy-pipe" for run in runs)
    finally:
        conn.close()
