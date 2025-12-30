from __future__ import annotations

import json
from pathlib import Path

import pytest

from server.app import scheduler
from server.app.deps import init_metadata_db
from server.app.storage import metadata_db
from server.app.storage.paths import get_namespace_dir, get_platform_db_path


@pytest.fixture()
def db_conn(tmp_path, monkeypatch):
    monkeypatch.setenv("DOCETL_HOME_DIR", str(tmp_path))
    monkeypatch.setenv("DOCETL_AUTH_SECRET", "test-secret")
    init_metadata_db()
    conn = metadata_db.get_connection(get_platform_db_path())
    try:
        yield conn
    finally:
        conn.close()


def test_register_generated_dataset_copies_raw(db_conn) -> None:
    namespace = "team-a"
    output_dir = get_namespace_dir(namespace) / "pipelines" / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "result.json"
    output_path.write_text(json.dumps([{"a": 1}]), encoding="utf-8")

    dataset_id = scheduler._register_generated_dataset(
        conn=db_conn,
        namespace=namespace,
        output_path=str(output_path),
        pipeline_id="pipeline-1",
        pipeline_name="Pipeline One",
        run_id="run-1",
        name_template=None,
    )
    db_conn.commit()

    row = metadata_db.get_dataset(db_conn, dataset_id)
    assert row is not None
    assert row.raw_path is not None
    assert row.path is not None
    assert Path(row.raw_path).exists()
    assert Path(row.path).exists()
    assert f"data_center/raw/{dataset_id}" in row.raw_path
    assert "data_center/datasets/generated" in row.path
