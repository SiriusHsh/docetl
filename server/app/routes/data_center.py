from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from server.app.deps import get_db
from server.app.models import DatasetFormat, DatasetIngestStatus, DatasetRecord, DatasetSource, NamespaceRole
from server.app.security import CurrentUser, assert_namespace_role, get_current_user, get_request_meta
from server.app.storage import metadata_db
from server.app.storage.paths import (
    get_data_center_dir,
    get_data_center_dataset_dir,
    get_data_center_raw_dir,
)


router = APIRouter(prefix="/data-center", tags=["data-center"])


def _to_dataset_record(row: metadata_db.DatasetRow) -> DatasetRecord:
    return DatasetRecord(
        id=row.id,
        namespace=row.namespace,
        name=row.name,
        source=DatasetSource(row.source),
        format=DatasetFormat(row.format),
        original_format=row.original_format,
        raw_path=row.raw_path,
        path=row.path,
        ingest_status=DatasetIngestStatus(row.ingest_status),
        ingest_config=row.ingest_config,
        created_at=row.created_at,
        updated_at=row.updated_at,
        schema=row.schema,
        row_count=row.row_count,
        lineage=row.lineage,
        tags=row.tags,
        description=row.description,
        error=row.error,
    )


def _safe_filename(filename: str) -> str:
    name = filename.strip() or f"dataset_{uuid.uuid4().hex}.bin"
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)


def _infer_schema(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not records:
        return None
    sample = records[0]
    if not isinstance(sample, dict):
        return None
    fields = []
    for key, value in sample.items():
        fields.append(
            {
                "name": key,
                "type": type(value).__name__,
            }
        )
    return {"fields": fields}


def _parse_json_bytes(content: bytes) -> list[dict[str, Any]]:
    try:
        payload = json.loads(content.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON format") from exc

    if isinstance(payload, list):
        if not payload:
            return []
        if not all(isinstance(item, dict) for item in payload):
            raise HTTPException(status_code=400, detail="JSON list must contain objects")
        return payload
    if isinstance(payload, dict):
        return [payload]

    raise HTTPException(status_code=400, detail="JSON must be an object or list of objects")


def _parse_csv_bytes(content: bytes) -> list[dict[str, Any]]:
    import csv
    from io import StringIO

    try:
        csv_string = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid CSV encoding") from exc

    csv_file = StringIO(csv_string)
    reader = csv.DictReader(csv_file)
    data = list(reader)
    if not data:
        return []
    return data


def _load_dataset_records(dataset_path: Path) -> list[dict[str, Any]]:
    try:
        content = dataset_path.read_bytes()
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Dataset file not found") from exc
    return _parse_json_bytes(content)


def _parse_excel_file(
    path: Path,
    *,
    sheet_name: str | None,
    sheet_index: int | None,
    header_row: int | None,
    max_rows: int | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import pandas as pd

    excel = pd.ExcelFile(path)
    available_sheets = excel.sheet_names

    if not available_sheets:
        raise HTTPException(status_code=400, detail="Excel file has no sheets")

    selected_sheet = sheet_name
    if selected_sheet is None and sheet_index is not None:
        if sheet_index < 0 or sheet_index >= len(available_sheets):
            raise HTTPException(status_code=400, detail="sheet_index out of range")
        selected_sheet = available_sheets[sheet_index]
    if selected_sheet is None:
        selected_sheet = available_sheets[0]

    header = 0 if header_row is None else header_row
    if header is not None and header < 0:
        header = None

    df = excel.parse(sheet_name=selected_sheet, header=header, nrows=max_rows)
    if header is None:
        df.columns = [f"col_{idx + 1}" for idx in range(len(df.columns))]

    df = df.dropna(how="all")
    records = json.loads(df.to_json(orient="records", date_format="iso"))
    ingest_config = {
        "sheet_name": selected_sheet,
        "sheet_index": available_sheets.index(selected_sheet),
        "header_row": header_row,
        "max_rows": max_rows,
        "available_sheets": available_sheets,
    }
    return records, ingest_config


def _serialize_records(records: list[dict[str, Any]], target_path: Path) -> int:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=True, indent=2)
    return len(records)


def _sanitize_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in records:
        cleaned: dict[str, Any] = {}
        for key, value in row.items():
            if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                cleaned[key] = None
            else:
                cleaned[key] = value
        normalized.append(cleaned)
    return normalized


def _merge_ingest_config(
    existing: dict[str, Any] | None, updates: dict[str, Any]
) -> dict[str, Any]:
    merged = dict(existing or {})
    merged.update(updates)
    return merged


def _build_progress(
    *,
    state: str,
    percent: int,
    message: str,
    attempt: int,
    max_attempts: int,
    queue_position: int | None = None,
    last_error: str | None = None,
) -> dict[str, Any]:
    progress = {
        "state": state,
        "percent": max(0, min(100, int(percent))),
        "message": message,
        "attempt": attempt,
        "max_attempts": max_attempts,
    }
    if queue_position is not None:
        progress["queue_position"] = queue_position
    if last_error:
        progress["last_error"] = last_error
    return progress


def _is_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _safe_delete_path(path_value: str | None, root: Path) -> None:
    if not path_value:
        return
    path = Path(path_value)
    resolved = path.resolve()
    if not _is_within_root(resolved, root):
        return
    try:
        resolved.unlink()
    except FileNotFoundError:
        return
    except IsADirectoryError:
        shutil.rmtree(resolved, ignore_errors=True)


def _update_ingest_progress(
    conn,
    *,
    dataset_id: str,
    progress: dict[str, Any],
    ingest_status: str | None = None,
    error: str | None | Any = metadata_db._UNSET,
) -> metadata_db.DatasetRow | None:
    row = metadata_db.get_dataset(conn, dataset_id)
    if row is None:
        return None
    ingest_config = _merge_ingest_config(
        row.ingest_config, {"progress": progress}
    )
    return metadata_db.update_dataset(
        conn,
        dataset_id,
        ingest_status=ingest_status
        if ingest_status is not None
        else metadata_db._UNSET,
        ingest_config=ingest_config,
        error=error,
    )


def _ingest_dataset_file(
    *,
    raw_path: Path,
    dataset_path: Path,
    ext: str,
    sheet_name: str | None,
    sheet_index: int | None,
    header_row: int | None,
    max_rows: int | None,
    progress_callback: Callable[[str, int, str], None] | None = None,
) -> tuple[int, dict[str, Any] | None, dict[str, Any] | None]:
    ingest_config: dict[str, Any] | None = None

    if progress_callback:
        progress_callback("parsing", 35, "Parsing file")

    if ext in {".json"}:
        records = _parse_json_bytes(raw_path.read_bytes())
    elif ext in {".csv"}:
        records = _parse_csv_bytes(raw_path.read_bytes())
    elif ext in {".xlsx", ".xls"}:
        records, ingest_config = _parse_excel_file(
            raw_path,
            sheet_name=sheet_name,
            sheet_index=sheet_index,
            header_row=header_row,
            max_rows=max_rows,
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    records = _sanitize_records(records)
    if progress_callback:
        progress_callback("writing", 80, "Writing normalized output")
    row_count = _serialize_records(records, dataset_path)
    schema = _infer_schema(records)

    return row_count, schema, ingest_config


def _ingest_dataset_job(
    *,
    dataset_id: str,
    namespace: str,
    raw_path: str,
    dataset_path: str,
    ext: str,
    sheet_name: str | None,
    sheet_index: int | None,
    header_row: int | None,
    max_rows: int | None,
    actor_user_id: str | None,
    actor_username: str | None,
    request_meta: dict[str, str | None],
    attempt: int,
    max_attempts: int,
) -> metadata_db.DatasetRow | None:
    conn = metadata_db.get_connection()
    try:
        dataset_row = metadata_db.get_dataset(conn, dataset_id)
        if dataset_row is None:
            return None

        def _progress(state: str, percent: int, message: str) -> None:
            _update_ingest_progress(
                conn,
                dataset_id=dataset_id,
                progress=_build_progress(
                    state=state,
                    percent=percent,
                    message=message,
                    attempt=attempt,
                    max_attempts=max_attempts,
                ),
                ingest_status=DatasetIngestStatus.PROCESSING.value,
                error=None,
            )
            conn.commit()

        _progress("processing", 10, "Preparing ingestion")

        row_count, schema, ingest_config = _ingest_dataset_file(
            raw_path=Path(raw_path),
            dataset_path=Path(dataset_path),
            ext=ext,
            sheet_name=sheet_name,
            sheet_index=sheet_index,
            header_row=header_row,
            max_rows=max_rows,
            progress_callback=_progress,
        )
        _progress("finalizing", 90, "Finalizing output")

        completed_progress = _build_progress(
            state="completed",
            percent=100,
            message="Ingestion completed",
            attempt=attempt,
            max_attempts=max_attempts,
        )
        ingest_config = _merge_ingest_config(
            dataset_row.ingest_config, ingest_config or {}
        )
        ingest_config = _merge_ingest_config(
            ingest_config, {"progress": completed_progress}
        )
        dataset_row = metadata_db.update_dataset(
            conn,
            dataset_row.id,
            ingest_status=DatasetIngestStatus.READY.value,
            ingest_config=ingest_config,
            schema=schema,
            row_count=row_count,
            error=None,
        )
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=actor_user_id,
            actor_username=actor_username,
            action="dataset.ingest_ready",
            resource_type="dataset",
            resource_id=dataset_row.id,
            namespace=namespace,
            success=True,
            ip=request_meta.get("ip"),
            user_agent=request_meta.get("user_agent"),
            request_id=request_meta.get("request_id"),
            detail={"row_count": dataset_row.row_count},
        )
        conn.commit()
        return dataset_row
    finally:
        conn.close()


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name, str(default))
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name, str(default))
    try:
        return float(value)
    except ValueError:
        return default


def _ingest_backoff_seconds(
    *, base: float, multiplier: float, max_backoff: float, next_attempt: int
) -> int:
    if next_attempt <= 1:
        return 0
    base_val = max(0.0, base)
    multiplier_val = max(1.0, multiplier)
    delay = base_val * (multiplier_val ** max(0, next_attempt - 2))
    if max_backoff > 0:
        delay = min(delay, max_backoff)
    return int(delay)


def _record_ingest_failure(
    *,
    dataset_id: str,
    namespace: str,
    error_message: str,
    actor_user_id: str | None,
    actor_username: str | None,
    request_meta: dict[str, str | None],
    attempt: int,
    max_attempts: int,
    retrying: bool,
    delay_seconds: int | None = None,
) -> None:
    conn = metadata_db.get_connection()
    try:
        state = "retrying" if retrying else "failed"
        message = (
            f"Retrying in {delay_seconds}s"
            if retrying and delay_seconds is not None
            else "Ingestion failed"
        )
        progress = _build_progress(
            state=state,
            percent=0 if retrying else 100,
            message=message,
            attempt=attempt,
            max_attempts=max_attempts,
            last_error=error_message,
        )
        ingest_status = (
            DatasetIngestStatus.PROCESSING.value
            if retrying
            else DatasetIngestStatus.FAILED.value
        )
        _update_ingest_progress(
            conn,
            dataset_id=dataset_id,
            progress=progress,
            ingest_status=ingest_status,
            error=None if retrying else error_message,
        )
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=actor_user_id,
            actor_username=actor_username,
            action="dataset.ingest_retry" if retrying else "dataset.ingest_failed",
            resource_type="dataset",
            resource_id=dataset_id,
            namespace=namespace,
            success=False,
            ip=request_meta.get("ip"),
            user_agent=request_meta.get("user_agent"),
            request_id=request_meta.get("request_id"),
            detail={
                "error": error_message,
                "attempt": attempt,
                "max_attempts": max_attempts,
                "delay_seconds": delay_seconds,
            },
        )
        conn.commit()
    finally:
        conn.close()


@dataclass
class IngestJob:
    dataset_id: str
    namespace: str
    raw_path: str
    dataset_path: str
    ext: str
    sheet_name: str | None
    sheet_index: int | None
    header_row: int | None
    max_rows: int | None
    actor_user_id: str | None
    actor_username: str | None
    request_meta: dict[str, str | None]
    attempt: int = 1


class DataCenterIngestQueue:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[IngestJob | None] | None = None
        self._workers: list[asyncio.Task] = []
        self._running = False
        self._disabled = (
            str(os.getenv("DOCETL_DISABLE_INGEST_QUEUE", "")).lower() == "true"
        )
        self._worker_count = max(1, _env_int("DOCETL_INGEST_WORKERS", 2))
        self._max_attempts = max(1, _env_int("DOCETL_INGEST_MAX_ATTEMPTS", 2))
        self._backoff_seconds = _env_float("DOCETL_INGEST_BACKOFF_SECONDS", 30.0)
        self._backoff_multiplier = _env_float(
            "DOCETL_INGEST_BACKOFF_MULTIPLIER", 2.0
        )
        self._max_backoff_seconds = _env_float(
            "DOCETL_INGEST_MAX_BACKOFF_SECONDS", 3600.0
        )

    async def start(self) -> None:
        if self._disabled or self._running:
            return
        self._queue = asyncio.Queue()
        self._running = True
        for _ in range(self._worker_count):
            self._workers.append(asyncio.create_task(self._worker_loop()))

    async def stop(self) -> None:
        if not self._running:
            return
        if self._queue is None:
            return
        for _ in self._workers:
            await self._queue.put(None)
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers = []
        self._queue = None
        self._running = False

    async def enqueue(self, job: IngestJob) -> int:
        if self._disabled or not self._running or self._queue is None:
            await self._handle_job(job)
            return 0
        await self._queue.put(job)
        queue_position = self._queue.qsize()
        conn = metadata_db.get_connection()
        try:
            _update_ingest_progress(
                conn,
                dataset_id=job.dataset_id,
                progress=_build_progress(
                    state="queued",
                    percent=0,
                    message="Queued",
                    attempt=job.attempt,
                    max_attempts=self._max_attempts,
                    queue_position=queue_position,
                ),
                ingest_status=DatasetIngestStatus.PROCESSING.value,
                error=None,
            )
            conn.commit()
        finally:
            conn.close()
        return queue_position

    async def _worker_loop(self) -> None:
        if self._queue is None:
            return
        while True:
            job = await self._queue.get()
            if job is None:
                break
            await self._handle_job(job)
            self._queue.task_done()

    async def _handle_job(self, job: IngestJob) -> None:
        try:
            await asyncio.to_thread(
                _ingest_dataset_job,
                dataset_id=job.dataset_id,
                namespace=job.namespace,
                raw_path=job.raw_path,
                dataset_path=job.dataset_path,
                ext=job.ext,
                sheet_name=job.sheet_name,
                sheet_index=job.sheet_index,
                header_row=job.header_row,
                max_rows=job.max_rows,
                actor_user_id=job.actor_user_id,
                actor_username=job.actor_username,
                request_meta=job.request_meta,
                attempt=job.attempt,
                max_attempts=self._max_attempts,
            )
        except HTTPException as exc:
            retryable = exc.status_code >= 500
            await self._handle_failure(job, str(exc.detail), retryable=retryable)
        except Exception as exc:  # pragma: no cover - defensive
            await self._handle_failure(job, str(exc), retryable=True)

    async def _handle_failure(
        self, job: IngestJob, error_message: str, *, retryable: bool
    ) -> None:
        should_retry = retryable and job.attempt < self._max_attempts
        if not should_retry:
            _record_ingest_failure(
                dataset_id=job.dataset_id,
                namespace=job.namespace,
                error_message=error_message,
                actor_user_id=job.actor_user_id,
                actor_username=job.actor_username,
                request_meta=job.request_meta,
                attempt=job.attempt,
                max_attempts=self._max_attempts,
                retrying=False,
            )
            return

        next_attempt = job.attempt + 1
        delay = _ingest_backoff_seconds(
            base=self._backoff_seconds,
            multiplier=self._backoff_multiplier,
            max_backoff=self._max_backoff_seconds,
            next_attempt=next_attempt,
        )
        _record_ingest_failure(
            dataset_id=job.dataset_id,
            namespace=job.namespace,
            error_message=error_message,
            actor_user_id=job.actor_user_id,
            actor_username=job.actor_username,
            request_meta=job.request_meta,
            attempt=job.attempt,
            max_attempts=self._max_attempts,
            retrying=True,
            delay_seconds=delay,
        )
        asyncio.create_task(self._retry_after(job, delay, next_attempt))

    async def _retry_after(
        self, job: IngestJob, delay: int, next_attempt: int
    ) -> None:
        if delay > 0:
            await asyncio.sleep(delay)
        await self.enqueue(
            IngestJob(
                dataset_id=job.dataset_id,
                namespace=job.namespace,
                raw_path=job.raw_path,
                dataset_path=job.dataset_path,
                ext=job.ext,
                sheet_name=job.sheet_name,
                sheet_index=job.sheet_index,
                header_row=job.header_row,
                max_rows=job.max_rows,
                actor_user_id=job.actor_user_id,
                actor_username=job.actor_username,
                request_meta=job.request_meta,
                attempt=next_attempt,
            )
        )


data_center_ingest_queue = DataCenterIngestQueue()


@router.get("/datasets", response_model=list[DatasetRecord])
def list_datasets(
    namespace: str,
    source: DatasetSource | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[DatasetRecord]:
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=NamespaceRole.VIEWER,
    )
    rows = metadata_db.list_datasets(
        conn,
        namespace=namespace,
        source=source.value if source is not None else None,
    )
    return [_to_dataset_record(row) for row in rows]


@router.get("/datasets/{dataset_id}", response_model=DatasetRecord)
def get_dataset(
    dataset_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> DatasetRecord:
    row = metadata_db.get_dataset(conn, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.VIEWER,
    )
    return _to_dataset_record(row)


@router.delete("/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict[str, str]:
    row = metadata_db.get_dataset(conn, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    data_center_root = get_data_center_dir(row.namespace)
    _safe_delete_path(row.path, data_center_root)
    _safe_delete_path(row.raw_path, data_center_root)
    raw_dir = get_data_center_raw_dir(row.namespace) / row.id
    if _is_within_root(raw_dir, data_center_root):
        shutil.rmtree(raw_dir, ignore_errors=True)

    metadata_db.delete_dataset(conn, dataset_id)
    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="dataset.delete",
        resource_type="dataset",
        resource_id=dataset_id,
        namespace=row.namespace,
        success=True,
        ip=meta.get("ip"),
        user_agent=meta.get("user_agent"),
        request_id=meta.get("request_id"),
        detail={"name": row.name, "source": row.source},
    )
    conn.commit()
    return {"status": "deleted", "id": dataset_id}


@router.get("/datasets/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
    sample: bool = False,
    sample_size: int = 50,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict[str, Any]:
    row = metadata_db.get_dataset(conn, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.VIEWER,
    )
    if row.ingest_status != DatasetIngestStatus.READY.value:
        raise HTTPException(status_code=409, detail="Dataset is not ready")

    dataset_path = Path(row.path)
    if not dataset_path.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found")

    records = _load_dataset_records(dataset_path)
    total = row.row_count or len(records)
    max_limit = 200
    limit = max(1, min(limit, max_limit))
    offset = max(0, offset)

    if sample:
        size = max(1, min(sample_size, len(records))) if records else 0
        items = random.sample(records, size) if size else []
        return {
            "items": items,
            "total": total,
            "offset": 0,
            "limit": size,
            "sample": True,
        }

    items = records[offset : offset + limit]
    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "sample": False,
    }


@router.post("/datasets/upload", response_model=DatasetRecord, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    namespace: str = Form(...),
    name: str | None = Form(None),
    sheet_name: str | None = Form(None),
    sheet_index: int | None = Form(None),
    header_row: int | None = Form(None),
    max_rows: int | None = Form(None),
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> DatasetRecord:
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=NamespaceRole.EDITOR,
    )

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    safe_name = _safe_filename(file.filename)
    ext = Path(safe_name).suffix.lower()
    original_format = ext.lstrip(".") if ext else None
    dataset_name = name.strip() if name and name.strip() else Path(safe_name).stem

    dataset_id = str(uuid.uuid4())
    raw_dir = get_data_center_raw_dir(namespace) / dataset_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / safe_name
    with raw_path.open("wb") as handle:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    dataset_path = get_data_center_dataset_dir(namespace, DatasetSource.USER_UPLOAD.value) / f"{dataset_id}.json"

    dataset_row = metadata_db.create_dataset(
        conn,
        namespace=namespace,
        name=dataset_name,
        source=DatasetSource.USER_UPLOAD.value,
        format=DatasetFormat.JSON.value,
        original_format=original_format,
        raw_path=str(raw_path),
        path=str(dataset_path),
        ingest_status=DatasetIngestStatus.PROCESSING.value,
        ingest_config={
            "sheet_name": sheet_name,
            "sheet_index": sheet_index,
            "header_row": header_row,
            "max_rows": max_rows,
        },
        dataset_id=dataset_id,
    )
    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="dataset.upload",
        resource_type="dataset",
        resource_id=dataset_row.id,
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"name": dataset_name, "format": original_format},
    )
    conn.commit()

    file_size = raw_path.stat().st_size
    async_threshold = _env_int("DOCETL_INGEST_ASYNC_BYTES", 5 * 1024 * 1024)
    should_queue = ext in {".xlsx", ".xls"} or (
        async_threshold > 0 and file_size >= async_threshold
    )
    max_attempts = max(1, _env_int("DOCETL_INGEST_MAX_ATTEMPTS", 2))

    if should_queue:
        await data_center_ingest_queue.enqueue(
            IngestJob(
                dataset_id=dataset_row.id,
                namespace=namespace,
                raw_path=str(raw_path),
                dataset_path=str(dataset_path),
                ext=ext,
                sheet_name=sheet_name,
                sheet_index=sheet_index,
                header_row=header_row,
                max_rows=max_rows,
                actor_user_id=current_user.id,
                actor_username=current_user.username,
                request_meta=meta,
                attempt=1,
            )
        )
        refreshed = metadata_db.get_dataset(conn, dataset_row.id) or dataset_row
        return _to_dataset_record(refreshed)

    try:
        dataset_row = _ingest_dataset_job(
            dataset_id=dataset_row.id,
            namespace=namespace,
            raw_path=raw_path,
            dataset_path=dataset_path,
            ext=ext,
            sheet_name=sheet_name,
            sheet_index=sheet_index,
            header_row=header_row,
            max_rows=max_rows,
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            request_meta=meta,
            attempt=1,
            max_attempts=max_attempts,
        )
    except HTTPException as exc:
        _record_ingest_failure(
            dataset_id=dataset_row.id,
            namespace=namespace,
            error_message=exc.detail,
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            request_meta=meta,
            attempt=1,
            max_attempts=max_attempts,
            retrying=False,
        )
        raise
    except Exception as exc:
        logging.exception("Failed to ingest dataset")
        _record_ingest_failure(
            dataset_id=dataset_row.id,
            namespace=namespace,
            error_message=str(exc),
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            request_meta=meta,
            attempt=1,
            max_attempts=max_attempts,
            retrying=False,
        )
        raise HTTPException(status_code=500, detail="Failed to ingest dataset") from exc

    return _to_dataset_record(dataset_row)
