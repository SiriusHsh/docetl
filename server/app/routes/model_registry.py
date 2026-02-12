from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import ModelRegistryRecord, ModelRegistryUpsertRequest, PlatformRole
from server.app.security import CurrentUser, get_current_user, get_request_meta, require_platform_admin
from server.app.storage import metadata_db


router = APIRouter(prefix="/models", tags=["models"])


def _to_model_record(row: metadata_db.ModelRegistryRow) -> ModelRegistryRecord:
    return ModelRegistryRecord(
        id=row.id,
        name=row.name,
        model_id=row.model_id,
        protocol=row.protocol,  # type: ignore[arg-type]
        base_url=row.base_url,
        api_key=row.api_key,
        tags=row.tags,
        description=row.description,
        status=row.status,  # type: ignore[arg-type]
        params=row.params,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[ModelRegistryRecord])
def list_models(
    include_inactive: bool | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[ModelRegistryRecord]:
    if include_inactive is None:
        include_inactive_value = current_user.platform_role == PlatformRole.PLATFORM_ADMIN
    else:
        include_inactive_value = bool(include_inactive)
        if include_inactive_value and current_user.platform_role != PlatformRole.PLATFORM_ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")

    rows = metadata_db.list_model_registry(
        conn,
        include_inactive=include_inactive_value,
    )
    return [_to_model_record(row) for row in rows]


@router.post("", response_model=ModelRegistryRecord, status_code=status.HTTP_201_CREATED)
def create_model(
    payload: ModelRegistryUpsertRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> ModelRegistryRecord:
    row = metadata_db.upsert_model_registry(
        conn,
        model_id=payload.id,
        name=payload.name,
        llm_model_id=payload.model_id,
        protocol=payload.protocol.value,
        base_url=payload.base_url,
        api_key=payload.api_key,
        tags=payload.tags,
        description=payload.description,
        status=payload.status.value,
        params=payload.params,
    )

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="model.upsert",
        resource_type="model",
        resource_id=row.id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"name": row.name, "status": row.status},
    )
    return _to_model_record(row)


@router.patch("/{model_id}", response_model=ModelRegistryRecord)
def update_model(
    model_id: str,
    payload: ModelRegistryUpsertRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> ModelRegistryRecord:
    existing = metadata_db.get_model_registry(conn, model_id=model_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Model not found")

    row = metadata_db.upsert_model_registry(
        conn,
        model_id=model_id,
        name=payload.name,
        llm_model_id=payload.model_id,
        protocol=payload.protocol.value,
        base_url=payload.base_url,
        api_key=payload.api_key,
        tags=payload.tags,
        description=payload.description,
        status=payload.status.value,
        params=payload.params,
    )

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="model.update",
        resource_type="model",
        resource_id=row.id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"name": row.name, "status": row.status},
    )
    return _to_model_record(row)


@router.delete("/{model_id}", status_code=204, response_model=None)
def delete_model(
    model_id: str,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    if metadata_db.get_model_registry(conn, model_id=model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")

    metadata_db.delete_model_registry(conn, model_id=model_id)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="model.delete",
        resource_type="model",
        resource_id=model_id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
