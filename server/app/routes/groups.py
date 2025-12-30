from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import (
    GroupCreateRequest,
    GroupMemberCreateRequest,
    GroupMemberRecord,
    GroupNamespaceAccessRecord,
    GroupNamespaceAccessRequest,
    GroupRecord,
    GroupUpdateRequest,
)
from server.app.security import CurrentUser, get_request_meta, require_platform_admin, validate_namespace
from server.app.storage import metadata_db


router = APIRouter(prefix="/groups", tags=["groups"])


def _to_group_record(group: metadata_db.GroupRow) -> GroupRecord:
    return GroupRecord(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def _to_group_member_record(member: metadata_db.GroupMemberRow) -> GroupMemberRecord:
    return GroupMemberRecord(
        group_id=member.group_id,
        user_id=member.user_id,
        username=member.username,
        email=member.email,
        is_active=member.is_active,
        platform_role=member.platform_role,  # type: ignore[arg-type]
        joined_at=member.joined_at,
    )


def _to_group_namespace_access_record(
    access: metadata_db.GroupNamespaceAccessRow,
) -> GroupNamespaceAccessRecord:
    return GroupNamespaceAccessRecord(
        group_id=access.group_id,
        namespace=access.namespace,
        role=access.role,  # type: ignore[arg-type]
        created_at=access.created_at,
        updated_at=access.updated_at,
    )


@router.get("", response_model=list[GroupRecord])
def list_groups(
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
    limit: int = 200,
    offset: int = 0,
) -> list[GroupRecord]:
    _ = current_user
    groups = metadata_db.list_groups(conn, limit=limit, offset=offset)
    return [_to_group_record(group) for group in groups]


@router.post("", response_model=GroupRecord, status_code=201)
def create_group(
    request: Request,
    payload: GroupCreateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> GroupRecord:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")
    try:
        group = metadata_db.create_group(conn, name=name, description=payload.description)
    except ValueError as exc:
        if str(exc) == "group_name_exists":
            raise HTTPException(status_code=400, detail="Group name already exists") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.create",
        resource_type="group",
        resource_id=group.id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"name": group.name},
    )
    return _to_group_record(group)


@router.patch("/{group_id}", response_model=GroupRecord)
def update_group(
    request: Request,
    group_id: str,
    payload: GroupUpdateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> GroupRecord:
    _ = current_user
    if payload.name is not None and not payload.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")
    try:
        group = metadata_db.update_group(
            conn,
            group_id=group_id,
            name=payload.name.strip() if payload.name is not None else None,
            description=payload.description,
        )
    except ValueError as exc:
        if str(exc) == "group_name_exists":
            raise HTTPException(status_code=400, detail="Group name already exists") from exc
        if str(exc) == "group_not_found":
            raise HTTPException(status_code=404, detail="Group not found") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.update",
        resource_type="group",
        resource_id=group.id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"name": group.name},
    )
    return _to_group_record(group)


@router.delete("/{group_id}", status_code=204, response_model=None)
def delete_group(
    request: Request,
    group_id: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    _ = current_user
    try:
        metadata_db.delete_group(conn, group_id)
    except ValueError as exc:
        if str(exc) == "group_not_found":
            raise HTTPException(status_code=404, detail="Group not found") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.delete",
        resource_type="group",
        resource_id=group_id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.get("/{group_id}/members", response_model=list[GroupMemberRecord])
def list_group_members(
    group_id: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> list[GroupMemberRecord]:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    members = metadata_db.list_group_members(conn, group_id=group_id)
    return [_to_group_member_record(member) for member in members]


@router.post("/{group_id}/members", status_code=204, response_model=None)
def add_group_member(
    request: Request,
    group_id: str,
    payload: GroupMemberCreateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    if metadata_db.get_user_by_id(conn, payload.user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    metadata_db.add_group_member(conn, group_id=group_id, user_id=payload.user_id)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.member.add",
        resource_type="group_member",
        resource_id=f"{group_id}:{payload.user_id}",
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.delete("/{group_id}/members/{user_id}", status_code=204, response_model=None)
def remove_group_member(
    request: Request,
    group_id: str,
    user_id: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    metadata_db.remove_group_member(conn, group_id=group_id, user_id=user_id)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.member.remove",
        resource_type="group_member",
        resource_id=f"{group_id}:{user_id}",
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.get("/{group_id}/namespace-access", response_model=list[GroupNamespaceAccessRecord])
def list_group_namespace_access(
    group_id: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> list[GroupNamespaceAccessRecord]:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    access = metadata_db.list_group_namespace_roles(conn, group_id=group_id)
    return [_to_group_namespace_access_record(item) for item in access]


@router.put("/{group_id}/namespace-access/{namespace}", status_code=204, response_model=None)
def upsert_group_namespace_access(
    request: Request,
    group_id: str,
    namespace: str,
    payload: GroupNamespaceAccessRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    namespace = validate_namespace(namespace)
    metadata_db.upsert_group_namespace_role(
        conn,
        group_id=group_id,
        namespace=namespace,
        role=payload.role.value,
    )

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.namespace.upsert",
        resource_type="group_namespace",
        resource_id=f"{group_id}:{namespace}",
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"role": payload.role.value},
    )


@router.delete("/{group_id}/namespace-access/{namespace}", status_code=204, response_model=None)
def remove_group_namespace_access(
    request: Request,
    group_id: str,
    namespace: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    _ = current_user
    if metadata_db.get_group_by_id(conn, group_id) is None:
        raise HTTPException(status_code=404, detail="Group not found")
    namespace = validate_namespace(namespace)
    metadata_db.remove_group_namespace_role(conn, group_id=group_id, namespace=namespace)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="group.namespace.remove",
        resource_type="group_namespace",
        resource_id=f"{group_id}:{namespace}",
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
