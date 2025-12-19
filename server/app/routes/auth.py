from __future__ import annotations

import re
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from server.app.deps import get_db
from server.app.models import AuthResponse, LoginRequest, MeResponse, RegisterRequest, UserPublic
from server.app.security import SESSION_COOKIE_NAME, CurrentUser, get_current_user, get_request_meta
from server.app.storage import metadata_db


router = APIRouter(prefix="/auth", tags=["auth"])


_USERNAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$")


def _validate_username(username: str) -> None:
    if not _USERNAME_RE.match(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username (3-64 chars; letters, digits, _ . -)",
        )


def _personal_namespace(username: str) -> str:
    namespace = re.sub(r"[^a-zA-Z0-9_-]+", "_", username.strip()).strip("_").lower()
    return namespace or f"user_{username.lower()}"


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


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(request: Request, payload: RegisterRequest, response: Response, conn=Depends(get_db)) -> AuthResponse:
    _validate_username(payload.username)
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    try:
        user = metadata_db.create_user(
            conn,
            username=payload.username,
            password=payload.password,
            email=payload.email,
            platform_role="user",
        )
    except ValueError as exc:
        if str(exc) == "username_or_email_exists":
            raise HTTPException(status_code=400, detail="Username or email already exists") from exc
        raise

    namespace = _personal_namespace(payload.username)
    metadata_db.upsert_membership(
        conn,
        user_id=user.id,
        namespace=namespace,
        role="namespace_admin",
    )

    token, expires_at = metadata_db.create_session(conn, user_id=user.id, ttl=timedelta(days=7))
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
    )

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=user.id,
        actor_username=user.username,
        action="auth.register",
        resource_type="user",
        resource_id=user.id,
        namespace=namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )

    return AuthResponse(user=_to_user_public(user), token=token, expires_at=expires_at)


@router.post("/login", response_model=AuthResponse)
def login(request: Request, payload: LoginRequest, response: Response, conn=Depends(get_db)) -> AuthResponse:
    user_and_hash = metadata_db.get_user_by_username(conn, payload.username)
    meta = get_request_meta(request)
    if user_and_hash is None:
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=None,
            actor_username=payload.username,
            action="auth.login",
            resource_type="user",
            resource_id=None,
            namespace=None,
            success=False,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
            detail={"reason": "user_not_found"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user, password_hash = user_and_hash
    if not user.is_active or not metadata_db.verify_password(payload.password, password_hash):
        metadata_db.insert_audit_log(
            conn,
            actor_user_id=user.id,
            actor_username=user.username,
            action="auth.login",
            resource_type="user",
            resource_id=user.id,
            namespace=None,
            success=False,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
            detail={"reason": "invalid_credentials_or_disabled"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    metadata_db.touch_last_login(conn, user.id)
    token, expires_at = metadata_db.create_session(conn, user_id=user.id, ttl=timedelta(days=7))
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
    )
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=user.id,
        actor_username=user.username,
        action="auth.login",
        resource_type="user",
        resource_id=user.id,
        namespace=None,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
    return AuthResponse(user=_to_user_public(user), token=token, expires_at=expires_at)


@router.post("/logout", status_code=204, response_model=None)
def logout(request: Request, response: Response, current_user: CurrentUser = Depends(get_current_user), conn=Depends(get_db)) -> None:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    token = ""
    if auth_header:
        parts = auth_header.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            token = parts[1].strip()
    if not token:
        token = request.cookies.get(SESSION_COOKIE_NAME) or ""
    if token:
        metadata_db.revoke_session(conn, token_hash=metadata_db.hash_session_token(token))
    response.delete_cookie(SESSION_COOKIE_NAME)
    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="auth.logout",
        resource_type="user",
        resource_id=current_user.id,
        namespace=None,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.get("/me", response_model=MeResponse)
def me(current_user: CurrentUser = Depends(get_current_user), conn=Depends(get_db)) -> MeResponse:
    user_row = metadata_db.get_user_by_id(conn, current_user.id)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    memberships = metadata_db.list_memberships(conn, user_id=current_user.id)
    return MeResponse(
        user=_to_user_public(user_row),
        memberships=memberships,  # type: ignore[arg-type]
    )
