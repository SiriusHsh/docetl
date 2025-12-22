from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from server.app.app_factory import create_app
from server.app.models import DatasetFormat, DatasetIngestStatus, DatasetSource
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


def _create_dataset(namespace: str, *, lineage: dict[str, str]) -> str:
    conn = metadata_db.get_connection(get_platform_db_path())
    try:
        row = metadata_db.create_dataset(
            conn,
            namespace=namespace,
            name="generated_dataset",
            source=DatasetSource.PIPELINE_GENERATED.value,
            format=DatasetFormat.JSON.value,
            original_format="json",
            raw_path="/tmp/output.json",
            path="/tmp/generated_dataset.json",
            ingest_status=DatasetIngestStatus.READY.value,
            row_count=1,
            lineage=lineage,
        )
        conn.commit()
        return row.id
    finally:
        conn.close()


def test_upload_excel_dataset(client: TestClient) -> None:
    token, namespace = _register_user(client, "excel_user")

    df = pd.DataFrame({"name": ["alpha", "beta"], "score": [1, 2]})
    buffer = BytesIO()
    df.to_excel(buffer, index=False)
    buffer.seek(0)

    files = {
        "file": (
            "sample.xlsx",
            buffer.getvalue(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    }
    data = {"namespace": namespace, "name": "sample_dataset"}

    resp = client.post(
        "/data-center/datasets/upload",
        headers=_auth_headers(token),
        data=data,
        files=files,
    )
    assert resp.status_code == 201, resp.text
    payload = resp.json()
    assert payload["ingest_status"] == "ready"
    assert payload["row_count"] == 2
    assert payload["original_format"] == "xlsx"
    assert Path(payload["path"]).exists()

    listing = client.get(
        f"/data-center/datasets?namespace={namespace}",
        headers=_auth_headers(token),
    )
    assert listing.status_code == 200, listing.text
    assert any(item["id"] == payload["id"] for item in listing.json())

    preview = client.get(
        f"/data-center/datasets/{payload['id']}/preview?limit=1&offset=0",
        headers=_auth_headers(token),
    )
    assert preview.status_code == 200, preview.text
    preview_json = preview.json()
    assert preview_json["total"] >= 2
    assert len(preview_json["items"]) == 1

    sample = client.get(
        f"/data-center/datasets/{payload['id']}/preview?sample=true&sample_size=1",
        headers=_auth_headers(token),
    )
    assert sample.status_code == 200, sample.text
    sample_json = sample.json()
    assert sample_json["sample"] is True
    assert len(sample_json["items"]) == 1


def test_dataset_detail_includes_lineage(client: TestClient) -> None:
    token, namespace = _register_user(client, "lineage_user")
    lineage = {
        "pipeline_id": "pipeline-123",
        "pipeline_name": "demo-pipeline",
        "run_id": "run-456",
        "output_path": "/tmp/output.json",
    }
    dataset_id = _create_dataset(namespace, lineage=lineage)

    resp = client.get(
        f"/data-center/datasets/{dataset_id}",
        headers=_auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["id"] == dataset_id
    assert payload["lineage"]["pipeline_id"] == lineage["pipeline_id"]
    assert payload["lineage"]["pipeline_name"] == lineage["pipeline_name"]
    assert payload["lineage"]["run_id"] == lineage["run_id"]
