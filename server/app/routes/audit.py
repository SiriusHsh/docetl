from __future__ import annotations

from fastapi import APIRouter, Depends

from server.app.deps import get_db
from server.app.models import AuditLogEntry
from server.app.security import CurrentUser, require_platform_admin
from server.app.storage import metadata_db


router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=list[AuditLogEntry])
def list_audit(
    namespace: str | None = None,
    actor_user_id: str | None = None,
    action: str | None = None,
    limit: int = 200,
    offset: int = 0,
    current_user: CurrentUser = Depends(require_platform_admin),
    conn=Depends(get_db),
) -> list[AuditLogEntry]:
    _ = current_user
    logs = metadata_db.list_audit_logs(
        conn,
        namespace=namespace,
        actor_user_id=actor_user_id,
        action=action,
        limit=limit,
        offset=offset,
    )
    return logs  # type: ignore[return-value]
