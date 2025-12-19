from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from server.app.deps import get_db
from server.app.models import (
    MembershipRecord,
    ResetPasswordRequest,
    SetMembershipRequest,
    UserCreateRequest,
    UserPublic,
    UserUpdateRequest,
)
from server.app.security import CurrentUser, get_request_meta, require_platform_admin
from server.app.storage import metadata_db


router = APIRouter(prefix="/users", tags=["users"])


def _to_user_public(user: metadata_db.UserRow) -> UserPublic:
    return UserPublic(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        platform_role=user.platform_role,  # type: ignore[arg-type]
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserPublic])
def list_all_users(
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
    limit: int = 200,
    offset: int = 0,
) -> list[UserPublic]:
    users = metadata_db.list_users(conn, limit=limit, offset=offset)
    return [_to_user_public(user) for user in users]


@router.post("", response_model=UserPublic, status_code=201)
def create_new_user(
    request: Request,
    payload: UserCreateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> UserPublic:
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        user = metadata_db.create_user(
            conn,
            username=payload.username,
            password=payload.password,
            email=payload.email,
            platform_role=payload.platform_role.value,
        )
    except ValueError as exc:
        if str(exc) == "username_or_email_exists":
            raise HTTPException(status_code=400, detail="Username or email already exists") from exc
        raise

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="user.create",
        resource_type="user",
        resource_id=user.id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"username": user.username},
    )
    return _to_user_public(user)


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    request: Request,
    user_id: str,
    payload: UserUpdateRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> UserPublic:
    user = metadata_db.get_user_by_id(conn, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.is_active is not None:
        user = metadata_db.set_user_active(conn, user_id, is_active=payload.is_active)
    if payload.platform_role is not None:
        user = metadata_db.set_user_platform_role(conn, user_id, platform_role=payload.platform_role.value)

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="user.update",
        resource_type="user",
        resource_id=user_id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"is_active": payload.is_active, "platform_role": payload.platform_role.value if payload.platform_role else None},
    )
    return _to_user_public(user)


@router.post("/{user_id}/reset-password", status_code=204, response_model=None)
def reset_password(
    request: Request,
    user_id: str,
    payload: ResetPasswordRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        metadata_db.set_user_password(conn, user_id, password=payload.password)
    except ValueError as exc:
        if str(exc) == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found") from exc
        raise
    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="user.reset_password",
        resource_type="user",
        resource_id=user_id,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.put("/{user_id}/namespaces/{namespace}", status_code=204, response_model=None)
def set_namespace_membership(
    request: Request,
    user_id: str,
    namespace: str,
    payload: SetMembershipRequest,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> None:
    user = metadata_db.get_user_by_id(conn, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    metadata_db.upsert_membership(conn, user_id=user_id, namespace=namespace, role=payload.role.value)
    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="membership.upsert",
        resource_type="membership",
        resource_id=f"{user_id}:{namespace}",
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"role": payload.role.value},
    )


@router.get("/{user_id}/memberships", response_model=list[MembershipRecord])
def list_user_memberships(
    user_id: str,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> list[MembershipRecord]:
    _ = current_user
    if metadata_db.get_user_by_id(conn, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    memberships = metadata_db.list_memberships(conn, user_id=user_id)
    return memberships  # type: ignore[return-value]
