from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import NamespaceRole, RunRecord, RunStatus, RunSummary
from server.app.run_manager import cancel_run as cancel_active_run
from server.app.security import CurrentUser, assert_namespace_role, get_current_user, get_request_meta, require_namespace_role
from server.app.storage import metadata_db


router = APIRouter(prefix="/runs", tags=["runs"])


def _to_run_record(row: metadata_db.RunRow) -> RunRecord:
    return RunRecord(
        id=row.id,
        namespace=row.namespace,
        pipeline_id=row.pipeline_id,
        pipeline_name=row.pipeline_name,
        trigger=row.trigger,
        deployment_id=row.deployment_id,
        status=RunStatus(row.status),
        created_at=row.created_at,
        started_at=row.started_at,
        ended_at=row.ended_at,
        cost=row.cost,
        output_path=row.output_path,
        log_path=row.log_path,
        error=row.error,
        metadata=row.metadata,
        scheduled_for=row.scheduled_for,
        attempt=row.attempt,
        max_attempts=row.max_attempts,
        triggered_by_user_id=row.triggered_by_user_id,
    )


@router.get("", response_model=list[RunRecord])
def list_runs(
    namespace: str,
    status: RunStatus | None = None,
    pipeline_id: str | None = None,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.VIEWER)
    ),
    conn=Depends(get_db),
) -> list[RunRecord]:
    _, namespace_value, _ = ctx
    rows = metadata_db.list_runs(
        conn,
        namespace=namespace_value,
        status=status.value if status is not None else None,
        pipeline_id=pipeline_id,
    )
    return [_to_run_record(row) for row in rows]


@router.get("/summary", response_model=RunSummary)
def run_summary(
    namespace: str,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.VIEWER)
    ),
    conn=Depends(get_db),
) -> RunSummary:
    _, namespace_value, _ = ctx
    summary = metadata_db.get_run_summary(conn, namespace=namespace_value)
    return RunSummary(**summary)


@router.get("/{run_id}", response_model=RunRecord)
def get_run(
    run_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> RunRecord:
    row = metadata_db.get_run(conn, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.VIEWER,
    )
    return _to_run_record(row)


@router.post("/{run_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
def cancel_run(
    run_id: str,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict[str, str]:
    row = metadata_db.get_run(conn, run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    if row.status in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Run already finished")

    if not cancel_active_run(run_id):
        raise HTTPException(status_code=409, detail="Run is not cancellable")

    meta = get_request_meta(request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="run.cancel",
        resource_type="run",
        resource_id=run_id,
        namespace=row.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )

    return {"status": "cancelling"}
