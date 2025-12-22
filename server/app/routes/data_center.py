from __future__ import annotations

import json
import logging
import math
import random
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from server.app.deps import get_db
from server.app.models import DatasetFormat, DatasetIngestStatus, DatasetRecord, DatasetSource, NamespaceRole
from server.app.security import CurrentUser, assert_namespace_role, get_current_user, get_request_meta
from server.app.storage import metadata_db
from server.app.storage.paths import (
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


def _parse_excel_bytes(
    content: bytes,
    *,
    sheet_name: str | None,
    sheet_index: int | None,
    header_row: int | None,
    max_rows: int | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import pandas as pd

    bio = BytesIO(content)
    excel = pd.ExcelFile(bio)
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

    content = await file.read()
    raw_path.write_bytes(content)

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

    try:
        records: list[dict[str, Any]]
        ingest_config: dict[str, Any] | None = None

        if ext in {".json"}:
            records = _parse_json_bytes(content)
        elif ext in {".csv"}:
            records = _parse_csv_bytes(content)
        elif ext in {".xlsx", ".xls"}:
            records, ingest_config = _parse_excel_bytes(
                content,
                sheet_name=sheet_name,
                sheet_index=sheet_index,
                header_row=header_row,
                max_rows=max_rows,
            )
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        records = _sanitize_records(records)
        row_count = _serialize_records(records, dataset_path)
        schema = _infer_schema(records)

        dataset_row = metadata_db.update_dataset(
            conn,
            dataset_row.id,
            ingest_status=DatasetIngestStatus.READY.value,
            ingest_config=ingest_config or dataset_row.ingest_config,
            schema=schema,
            row_count=row_count,
        )
    except HTTPException as exc:
        metadata_db.update_dataset(
            conn,
            dataset_row.id,
            ingest_status=DatasetIngestStatus.FAILED.value,
            error=exc.detail,
        )
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            action="dataset.ingest_failed",
            resource_type="dataset",
            resource_id=dataset_row.id,
            namespace=namespace,
            success=False,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
            detail={"error": exc.detail},
        )
        raise
    except Exception as exc:
        logging.exception("Failed to ingest dataset")
        metadata_db.update_dataset(
            conn,
            dataset_row.id,
            ingest_status=DatasetIngestStatus.FAILED.value,
            error=str(exc),
        )
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=current_user.id,
            actor_username=current_user.username,
            action="dataset.ingest_failed",
            resource_type="dataset",
            resource_id=dataset_row.id,
            namespace=namespace,
            success=False,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
            detail={"error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="Failed to ingest dataset") from exc

    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="dataset.ingest_ready",
        resource_type="dataset",
        resource_id=dataset_row.id,
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"row_count": dataset_row.row_count},
    )
    return _to_dataset_record(dataset_row)
