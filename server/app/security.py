from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Callable

from fastapi import Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import NamespaceRole, PlatformRole
from server.app.storage import metadata_db
from server.app.storage import paths as storage_paths


SESSION_COOKIE_NAME = "docetl_session"
ALL_NAMESPACES = "__all__"
DEFAULT_PUBLIC_NAMESPACE = "public_business"

_NAMESPACE_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$")


@dataclass(frozen=True)
class CurrentUser:
    id: str
    username: str
    email: str | None
    is_active: bool
    platform_role: PlatformRole
    created_at: int
    updated_at: int
    last_login_at: int | None


def _user_from_row(row: metadata_db.UserRow) -> CurrentUser:
    return CurrentUser(
        id=row.id,
        username=row.username,
        email=row.email,
        is_active=row.is_active,
        platform_role=PlatformRole(row.platform_role),
        created_at=row.created_at,
        updated_at=row.updated_at,
        last_login_at=row.last_login_at,
    )


def _token_from_request(request: Request) -> str | None:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header:
        parts = auth_header.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
            return parts[1].strip()
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        return cookie_token
    return None


def get_request_meta(request: Request) -> dict[str, str | None]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    request_id = getattr(request.state, "request_id", None)
    return {"ip": client_ip, "user_agent": user_agent, "request_id": request_id}


def get_current_user(request: Request, conn=Depends(get_db)) -> CurrentUser:
    token = _token_from_request(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return get_current_user_from_token(conn, token)


def get_current_user_from_token(conn, token: str) -> CurrentUser:
    token_hash = metadata_db.hash_session_token(token)
    user = metadata_db.resolve_session_user(conn, token_hash=token_hash)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is disabled")
    return _user_from_row(user)


def require_platform_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.platform_role != PlatformRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


_NAMESPACE_ROLE_RANK: dict[NamespaceRole, int] = {
    NamespaceRole.VIEWER: 0,
    NamespaceRole.EDITOR: 1,
    NamespaceRole.NAMESPACE_ADMIN: 2,
}


def validate_namespace(namespace: str) -> str:
    namespace = namespace.strip()
    if not namespace:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Namespace is required")
    if not _NAMESPACE_RE.match(namespace):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid namespace")
    return namespace


def assert_namespace_role(
    *,
    conn,
    current_user: CurrentUser,
    namespace: str,
    min_role: NamespaceRole,
) -> NamespaceRole:
    namespace = validate_namespace(namespace)

    if current_user.platform_role == PlatformRole.PLATFORM_ADMIN:
        return NamespaceRole.NAMESPACE_ADMIN

    namespace_meta = metadata_db.get_namespace_catalog(conn, namespace=namespace)
    if namespace_meta is not None and not namespace_meta.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Namespace is inactive")

    roles: list[NamespaceRole] = []

    direct_role = metadata_db.get_namespace_role(
        conn,
        user_id=current_user.id,
        namespace=namespace,
    )
    if direct_role is not None:
        roles.append(NamespaceRole(direct_role))

    if not roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to namespace")

    role = max(roles, key=lambda value: _NAMESPACE_ROLE_RANK[value])
    if _NAMESPACE_ROLE_RANK[role] < _NAMESPACE_ROLE_RANK[min_role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role for namespace")

    return role


def resolve_legacy_public_namespace_alias(
    *,
    conn,
    current_user: CurrentUser,
    namespace: str,
    min_role: NamespaceRole,
) -> str | None:
    if current_user.platform_role == PlatformRole.PLATFORM_ADMIN:
        return None

    namespace_value = str(namespace).strip()
    if namespace_value == DEFAULT_PUBLIC_NAMESPACE:
        return None

    # Backward compatibility: legacy personal namespaces matched username.
    if namespace_value != current_user.username:
        return None

    try:
        assert_namespace_role(
            conn=conn,
            current_user=current_user,
            namespace=DEFAULT_PUBLIC_NAMESPACE,
            min_role=min_role,
        )
    except HTTPException:
        return None

    return DEFAULT_PUBLIC_NAMESPACE


def resolve_namespace_for_read(
    *,
    conn,
    current_user: CurrentUser,
    namespace: str,
    min_role: NamespaceRole = NamespaceRole.VIEWER,
) -> str | None:
    namespace_value = str(namespace).strip()
    if namespace_value == ALL_NAMESPACES:
        if current_user.platform_role != PlatformRole.PLATFORM_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to all namespaces")
        return None
    validated = validate_namespace(namespace_value)
    try:
        assert_namespace_role(
            conn=conn,
            current_user=current_user,
            namespace=validated,
            min_role=min_role,
        )
        return validated
    except HTTPException as exc:
        if exc.status_code != status.HTTP_403_FORBIDDEN or str(exc.detail) != "No access to namespace":
            raise

    aliased_namespace = resolve_legacy_public_namespace_alias(
        conn=conn,
        current_user=current_user,
        namespace=validated,
        min_role=min_role,
    )
    if aliased_namespace is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to namespace")
    return aliased_namespace


def resolve_docetl_namespace_for_path(path: str) -> tuple[str, Path]:
    """Resolve a filesystem path and extract its namespace under `~/.docetl/<namespace>/...`."""
    resolved = Path(path).expanduser().resolve(strict=False)
    docetl_root = storage_paths.get_docetl_root_dir().expanduser().resolve(strict=False)

    try:
        relative = resolved.relative_to(docetl_root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path") from exc

    if not relative.parts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")

    namespace = relative.parts[0]
    if namespace.startswith("_"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to internal namespace is forbidden")

    return validate_namespace(namespace), resolved


def require_namespace_role(
    *,
    min_role: NamespaceRole,
    namespace_param: str = "namespace",
) -> Callable[..., tuple[CurrentUser, str, NamespaceRole]]:
    def _dep(
        request: Request,
        current_user: CurrentUser = Depends(get_current_user),
        conn=Depends(get_db),
    ) -> tuple[CurrentUser, str, NamespaceRole]:
        namespace = request.path_params.get(namespace_param) or request.query_params.get(namespace_param)
        if not namespace:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Namespace is required")

        namespace_value = validate_namespace(str(namespace))
        role = assert_namespace_role(
            conn=conn,
            current_user=current_user,
            namespace=namespace_value,
            min_role=min_role,
        )
        return current_user, namespace_value, role

    return _dep
