import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from server.app.models import PipelineRecord


_DOCETL_NAMESPACE_SEGMENT_RE = re.compile(
    r"(^|[/\\])\.docetl([/\\])([^/\\]+)([/\\])"
)


def _get_home_dir() -> str:
    """Resolve the DocETL home directory."""
    return os.getenv("DOCETL_HOME_DIR", os.path.expanduser("~"))


def _get_store_dir(namespace: str) -> Path:
    """Return the directory where pipeline JSON blobs are stored."""
    store_dir = Path(_get_home_dir()) / ".docetl" / namespace / "pipelines" / "store"
    store_dir.mkdir(parents=True, exist_ok=True)
    return store_dir


def _get_pipeline_path(namespace: str, pipeline_id: str) -> Path:
    return _get_store_dir(namespace) / f"{pipeline_id}.json"


def _rewrite_docetl_namespace_segment(value: str, namespace: str) -> str:
    def _replace(match: re.Match[str]) -> str:
        current = match.group(3)
        if current == namespace or current.startswith("_"):
            return match.group(0)
        return f"{match.group(1)}.docetl{match.group(2)}{namespace}{match.group(4)}"

    return _DOCETL_NAMESPACE_SEGMENT_RE.sub(_replace, value)


def _normalize_namespace_payload(value: Any, *, namespace: str) -> tuple[Any, bool]:
    if isinstance(value, dict):
        changed = False
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if key == "namespace" and isinstance(item, str) and item != namespace:
                normalized[key] = namespace
                changed = True
                continue
            normalized_item, item_changed = _normalize_namespace_payload(
                item,
                namespace=namespace,
            )
            normalized[key] = normalized_item
            changed = changed or item_changed
        return normalized, changed

    if isinstance(value, list):
        changed = False
        normalized_list: list[Any] = []
        for item in value:
            normalized_item, item_changed = _normalize_namespace_payload(
                item,
                namespace=namespace,
            )
            normalized_list.append(normalized_item)
            changed = changed or item_changed
        return normalized_list, changed

    if isinstance(value, str):
        rewritten = _rewrite_docetl_namespace_segment(value, namespace)
        return rewritten, rewritten != value

    return value, False


def _normalize_pipeline_payload(
    payload: dict[str, Any],
    *,
    namespace: str,
) -> tuple[dict[str, Any], bool]:
    changed = False
    normalized = dict(payload)
    if normalized.get("namespace") != namespace:
        normalized["namespace"] = namespace
        changed = True

    normalized_state, state_changed = _normalize_namespace_payload(
        normalized.get("state"),
        namespace=namespace,
    )
    if state_changed:
        normalized["state"] = normalized_state
        changed = True

    return normalized, changed


def _read_pipeline(path: Path, *, namespace: str | None = None) -> tuple[PipelineRecord, bool]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    changed = False
    if namespace is not None:
        data, changed = _normalize_pipeline_payload(data, namespace=namespace)

    return PipelineRecord.model_validate(data), changed


def _write_pipeline_to_path(path: Path, record: PipelineRecord) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(record.model_dump(mode="json"), handle, indent=2)


def _write_pipeline(record: PipelineRecord) -> None:
    _write_pipeline_to_path(_get_pipeline_path(record.namespace, record.id), record)


def _ensure_unique_name(namespace: str, name: str, ignore_id: str | None = None) -> None:
    for pipeline in list_pipelines(namespace):
        if ignore_id and pipeline.id == ignore_id:
            continue
        if pipeline.name.lower() == name.lower():
            raise HTTPException(
                status_code=400, detail=f"Pipeline name '{name}' already exists"
            )


def _normalize_state(state: dict[str, Any] | None) -> dict[str, Any]:
    if state is None:
        return {}
    # Deep copy to avoid shared references
    return json.loads(json.dumps(state))


def list_pipelines(namespace: str) -> list[PipelineRecord]:
    """Return all pipelines for a namespace sorted by updated time descending."""
    store_dir = _get_store_dir(namespace)
    records: list[PipelineRecord] = []

    for path in store_dir.glob("*.json"):
        try:
            record, changed = _read_pipeline(path, namespace=namespace)
            if changed:
                _write_pipeline_to_path(path, record)
            records.append(record)
        except Exception:
            # Skip unreadable pipeline blobs but keep others available
            continue

    records.sort(key=lambda record: record.updated_at, reverse=True)
    return records


def load_pipeline(namespace: str, pipeline_id: str) -> PipelineRecord:
    path = _get_pipeline_path(namespace, pipeline_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Pipeline not found")
    record, changed = _read_pipeline(path, namespace=namespace)
    if changed:
        _write_pipeline_to_path(path, record)
    return record


def create_pipeline(
    namespace: str,
    name: str,
    state: dict[str, Any] | None = None,
    description: str | None = None,
) -> PipelineRecord:
    _ensure_unique_name(namespace, name)
    now = datetime.utcnow()
    record = PipelineRecord(
        id=str(uuid.uuid4()),
        name=name,
        namespace=namespace,
        description=description,
        state=_normalize_state(state),
        created_at=now,
        updated_at=now,
        last_run_status=None,
        last_run_at=None,
    )
    _write_pipeline(record)
    return record


def update_pipeline(
    namespace: str,
    pipeline_id: str,
    name: str | None = None,
    state: dict[str, Any] | None = None,
    description: str | None = None,
    expected_updated_at: datetime | None = None,
) -> PipelineRecord:
    record = load_pipeline(namespace, pipeline_id)

    if expected_updated_at and record.updated_at.replace(
        tzinfo=None
    ) > expected_updated_at.replace(tzinfo=None):
        raise HTTPException(
            status_code=409,
            detail="Pipeline has been modified by another session",
        )

    if name and name != record.name:
        _ensure_unique_name(namespace, name, ignore_id=pipeline_id)
        record.name = name

    if description is not None:
        record.description = description

    if state is not None:
        record.state = _normalize_state(state)

    record.updated_at = datetime.utcnow()
    _write_pipeline(record)
    return record


def delete_pipeline(namespace: str, pipeline_id: str) -> None:
    path = _get_pipeline_path(namespace, pipeline_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Pipeline not found")
    path.unlink()


def duplicate_pipeline(
    namespace: str, pipeline_id: str, name: str | None = None
) -> PipelineRecord:
    original = load_pipeline(namespace, pipeline_id)
    duplicate_name = name or f"{original.name} Copy"
    _ensure_unique_name(namespace, duplicate_name)
    now = datetime.utcnow()
    record = PipelineRecord(
        id=str(uuid.uuid4()),
        name=duplicate_name,
        namespace=namespace,
        description=original.description,
        state=_normalize_state(original.state),
        created_at=now,
        updated_at=now,
        last_run_status=original.last_run_status,
        last_run_at=original.last_run_at,
    )
    _write_pipeline(record)
    return record


def update_pipeline_run_status(
    namespace: str, pipeline_id: str, status: str
) -> None:
    try:
        record = load_pipeline(namespace, pipeline_id)
    except HTTPException:
        return

    record.last_run_status = status
    record.last_run_at = datetime.utcnow()
    record.updated_at = datetime.utcnow()
    _write_pipeline(record)
