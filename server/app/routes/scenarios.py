from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import (
    BusinessScenarioCreateRequest,
    BusinessScenarioMineRecord,
    BusinessScenarioRecord,
    BusinessScenarioUpdateRequest,
    ScenarioUserAssignmentRecord,
)
from server.app.security import (
    CurrentUser,
    get_current_user,
    get_request_meta,
    require_platform_admin,
    validate_namespace,
)
from server.app.storage import metadata_db


router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def _to_scenario_record(row: metadata_db.NamespaceCatalogRow) -> BusinessScenarioRecord:
    return BusinessScenarioRecord(
        namespace=row.namespace,
        display_name=row.display_name,
        description=row.description,
        is_active=row.is_active,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _slugify_display_name(display_name: str) -> str:
    normalized = unicodedata.normalize("NFKC", display_name).strip().lower()
    collapsed = re.sub(r"\s+", "_", normalized)
    slug = re.sub(r"[^a-z0-9_.-]+", "_", collapsed)
    slug = re.sub(r"_+", "_", slug).strip("_.-")
    if not slug:
        slug = "scenario"
    if not slug[0].isalnum():
        slug = f"s_{slug}"
    return slug[:64]


def _generate_namespace_slug(conn, display_name: str) -> str:
    base = _slugify_display_name(display_name)
    candidate = base
    suffix = 2
    while metadata_db.get_namespace_catalog(conn, namespace=candidate) is not None:
        suffix_str = f"_{suffix}"
        candidate = f"{base[: max(1, 64 - len(suffix_str))]}{suffix_str}"
        suffix += 1
    return validate_namespace(candidate)


def _ensure_namespace_exists(conn, namespace: str) -> metadata_db.NamespaceCatalogRow:
    row = metadata_db.get_namespace_catalog(conn, namespace=namespace)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return row


@router.get("/mine", response_model=list[BusinessScenarioMineRecord])
def list_my_scenarios(
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[BusinessScenarioMineRecord]:
    rows = metadata_db.list_effective_memberships(
        conn,
        user_id=current_user.id,
        include_inactive=False,
    )
    return [
        BusinessScenarioMineRecord(
            namespace=str(row["namespace"]),
            display_name=str(row.get("display_name") or row["namespace"]),
            description=(
                str(row["description"]) if row.get("description") is not None else None
            ),
            is_active=bool(row.get("is_active", True)),
            effective_role=str(row["role"]),  # type: ignore[arg-type]
            created_at=int(row["created_at"]),
            updated_at=int(row["updated_at"]),
        )
        for row in rows
    ]


@router.get("", response_model=list[BusinessScenarioRecord])
def list_scenarios(
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
    include_inactive: bool = True,
    limit: int = 500,
    offset: int = 0,
) -> list[BusinessScenarioRecord]:
    _ = current_user
    rows = metadata_db.list_namespace_catalog(
        conn,
        include_inactive=include_inactive,
        limit=limit,
        offset=offset,
    )
    return [_to_scenario_record(row) for row in rows]


@router.post("", response_model=BusinessScenarioRecord, status_code=status.HTTP_201_CREATED)
def create_scenario(
    payload: BusinessScenarioCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> BusinessScenarioRecord:
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required")

    namespace = _generate_namespace_slug(conn, display_name)

    try:
        row = metadata_db.create_namespace_catalog_entry(
            conn,
            namespace=namespace,
            display_name=display_name,
            description=payload.description,
            created_by_user_id=current_user.id,
        )
    except ValueError as exc:
        if str(exc) == "namespace_or_display_name_exists":
            raise HTTPException(status_code=400, detail="Scenario already exists") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="scenario.create",
        resource_type="scenario",
        resource_id=row.namespace,
        namespace=row.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"display_name": display_name},
    )
    return _to_scenario_record(row)


@router.patch("/{namespace}", response_model=BusinessScenarioRecord)
def update_scenario(
    namespace: str,
    payload: BusinessScenarioUpdateRequest,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> BusinessScenarioRecord:
    namespace_value = validate_namespace(namespace)
    _ensure_namespace_exists(conn, namespace_value)

    updates = payload.model_fields_set
    if not updates:
        row = metadata_db.get_namespace_catalog(conn, namespace=namespace_value)
        if row is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        return _to_scenario_record(row)

    display_name = payload.display_name.strip() if payload.display_name is not None else metadata_db._UNSET
    if display_name is not metadata_db._UNSET and not display_name:
        raise HTTPException(status_code=400, detail="display_name cannot be empty")

    try:
        row = metadata_db.update_namespace_catalog(
            conn,
            namespace=namespace_value,
            display_name=display_name,
            description=payload.description if "description" in updates else metadata_db._UNSET,
            is_active=payload.is_active if "is_active" in updates else metadata_db._UNSET,
        )
    except ValueError as exc:
        if str(exc) == "namespace_not_found":
            raise HTTPException(status_code=404, detail="Scenario not found") from exc
        if str(exc) == "display_name_exists":
            raise HTTPException(status_code=400, detail="display_name already exists") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="scenario.update",
        resource_type="scenario",
        resource_id=namespace_value,
        namespace=namespace_value,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={
            "display_name": payload.display_name,
            "description": payload.description,
            "is_active": payload.is_active,
        },
    )
    return _to_scenario_record(row)


@router.get("/{namespace}/users", response_model=list[ScenarioUserAssignmentRecord])
def list_scenario_users(
    namespace: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> list[ScenarioUserAssignmentRecord]:
    _ = current_user
    namespace_value = validate_namespace(namespace)
    _ensure_namespace_exists(conn, namespace_value)
    rows = metadata_db.list_namespace_users(conn, namespace=namespace_value)
    return [ScenarioUserAssignmentRecord(**row) for row in rows]


@router.put("/{namespace}/users/{user_id}", status_code=204, response_model=None)
def upsert_scenario_user(
    namespace: str,
    user_id: str,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    namespace_value = validate_namespace(namespace)
    _ensure_namespace_exists(conn, namespace_value)
    if metadata_db.get_user_by_id(conn, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")

    metadata_db.upsert_membership(
        conn,
        user_id=user_id,
        namespace=namespace_value,
    )

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="scenario.user.assign",
        resource_type="scenario_membership",
        resource_id=f"{namespace_value}:{user_id}",
        namespace=namespace_value,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"role": "editor"},
    )


@router.delete("/{namespace}/users/{user_id}", status_code=204, response_model=None)
def remove_scenario_user(
    namespace: str,
    user_id: str,
    request: Request,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    namespace_value = validate_namespace(namespace)
    _ensure_namespace_exists(conn, namespace_value)
    metadata_db.remove_membership(conn, user_id=user_id, namespace=namespace_value)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="scenario.user.remove",
        resource_type="scenario_membership",
        resource_id=f"{namespace_value}:{user_id}",
        namespace=namespace_value,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
