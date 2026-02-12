from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status

from server.app.deps import get_db
from server.app.models import (
    DeploymentCreateRequest,
    DeploymentMisfirePolicy,
    DeploymentRecord,
    DeploymentScheduleType,
    DeploymentUpdateRequest,
    NamespaceRole,
)
from server.app.scheduler import compute_next_run_at, deployment_scheduler
from server.app.security import (
    CurrentUser,
    assert_namespace_role,
    get_current_user,
    get_request_meta,
    require_namespace_role,
    resolve_namespace_for_read,
)
from server.app.storage import metadata_db
from server.app.storage.pipeline_store import load_pipeline


router = APIRouter(prefix="/deployments", tags=["deployments"])


def _validate_schedule(
    schedule_type: DeploymentScheduleType, schedule: dict
) -> None:
    if schedule_type == DeploymentScheduleType.CRON:
        if not isinstance(schedule.get("cron"), str):
            raise HTTPException(status_code=400, detail="Cron schedule requires cron")
    elif schedule_type == DeploymentScheduleType.INTERVAL:
        every = schedule.get("every")
        unit = schedule.get("unit")
        if not isinstance(every, int) or every <= 0:
            raise HTTPException(status_code=400, detail="Interval schedule requires positive every")
        if unit not in {"seconds", "minutes", "hours", "days"}:
            raise HTTPException(status_code=400, detail="Interval schedule unit invalid")
    elif schedule_type == DeploymentScheduleType.ONCE:
        if not isinstance(schedule.get("run_at"), str):
            raise HTTPException(status_code=400, detail="Once schedule requires run_at")
    else:
        raise HTTPException(status_code=400, detail="Unsupported schedule type")


def _validate_retry_policy(policy: dict | None) -> None:
    if policy is None:
        return
    if not isinstance(policy, dict):
        raise HTTPException(status_code=400, detail="Retry policy must be an object")

    def _ensure_number(field: str, *, minimum: float | None = None) -> None:
        if field not in policy:
            return
        value = policy[field]
        if isinstance(value, bool):
            raise HTTPException(status_code=400, detail=f"{field} must be a number")
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{field} must be a number")
        if minimum is not None and numeric < minimum:
            raise HTTPException(
                status_code=400, detail=f"{field} must be >= {minimum}"
            )

    def _ensure_bool(field: str) -> None:
        if field not in policy:
            return
        if not isinstance(policy[field], bool):
            raise HTTPException(status_code=400, detail=f"{field} must be boolean")

    _ensure_number("max_attempts", minimum=1)
    _ensure_number("backoff_seconds", minimum=0)
    _ensure_number("backoff_multiplier", minimum=1)
    _ensure_number("max_backoff_seconds", minimum=0)
    _ensure_bool("notify_on_final_failure")
    _ensure_bool("notify_on_each_failure")

    webhook_url = policy.get("notify_webhook_url")
    if webhook_url is not None and not isinstance(webhook_url, str):
        raise HTTPException(status_code=400, detail="notify_webhook_url must be a string")


def _to_record(row: metadata_db.DeploymentRow) -> DeploymentRecord:
    return DeploymentRecord(
        id=row.id,
        namespace=row.namespace,
        name=row.name,
        pipeline_id=row.pipeline_id,
        enabled=row.enabled,
        schedule_type=DeploymentScheduleType(row.schedule_type),
        schedule=row.schedule,
        timezone=row.timezone,
        input_dataset_id=row.input_dataset_id,
        output_to_data_center=row.output_to_data_center,
        output_dataset_name_tpl=row.output_dataset_name_tpl,
        misfire_policy=DeploymentMisfirePolicy(row.misfire_policy),
        max_catchup_runs=row.max_catchup_runs,
        retry_policy=row.retry_policy,
        concurrency_policy=row.concurrency_policy,
        last_run_id=row.last_run_id,
        next_run_at=row.next_run_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _build_temp_row(
    request: DeploymentCreateRequest | DeploymentUpdateRequest,
    *,
    schedule_type: DeploymentScheduleType,
    schedule: dict,
    timezone: str,
) -> metadata_db.DeploymentRow:
    return metadata_db.DeploymentRow(
        id="temp",
        namespace=request.namespace,
        name=request.name or "temp",
        pipeline_id=request.pipeline_id or "temp",
        enabled=request.enabled if request.enabled is not None else True,
        schedule_type=schedule_type.value,
        schedule=schedule,
        timezone=timezone,
        input_dataset_id=request.input_dataset_id,
        output_to_data_center=bool(request.output_to_data_center),
        output_dataset_name_tpl=request.output_dataset_name_tpl,
        misfire_policy=(request.misfire_policy or DeploymentMisfirePolicy.RUN_ONCE).value,
        max_catchup_runs=request.max_catchup_runs,
        retry_policy=request.retry_policy,
        concurrency_policy=request.concurrency_policy,
        last_run_id=None,
        next_run_at=None,
        created_at=0,
        updated_at=0,
    )


@router.get("", response_model=list[DeploymentRecord])
def list_deployments(
    namespace: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[DeploymentRecord]:
    namespace_value = resolve_namespace_for_read(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=NamespaceRole.VIEWER,
    )
    rows = metadata_db.list_deployments(conn, namespace=namespace_value)
    return [_to_record(row) for row in rows]


@router.post("", response_model=DeploymentRecord, status_code=201)
def create_deployment(
    request: DeploymentCreateRequest,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> DeploymentRecord:
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=request.namespace,
        min_role=NamespaceRole.EDITOR,
    )
    _validate_schedule(request.schedule_type, request.schedule)
    _validate_retry_policy(request.retry_policy)

    timezone = request.timezone or "Asia/Shanghai"
    load_pipeline(request.namespace, request.pipeline_id)

    if request.input_dataset_id:
        dataset = metadata_db.get_dataset(conn, request.input_dataset_id)
        if dataset is None or dataset.namespace != request.namespace:
            raise HTTPException(status_code=400, detail="Invalid input dataset")

    temp = _build_temp_row(
        request,
        schedule_type=request.schedule_type,
        schedule=request.schedule,
        timezone=timezone,
    )
    try:
        next_run_at = compute_next_run_at(
            temp, after_ts=None, now_ts=metadata_db.utc_now_ts()
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        row = metadata_db.create_deployment(
            conn,
            namespace=request.namespace,
            name=request.name,
            pipeline_id=request.pipeline_id,
            enabled=request.enabled,
            schedule_type=request.schedule_type.value,
            schedule=request.schedule,
            timezone=timezone,
            input_dataset_id=request.input_dataset_id,
            output_to_data_center=request.output_to_data_center,
            output_dataset_name_tpl=request.output_dataset_name_tpl,
            misfire_policy=request.misfire_policy.value,
            max_catchup_runs=request.max_catchup_runs,
            retry_policy=request.retry_policy,
            concurrency_policy=request.concurrency_policy,
            next_run_at=next_run_at if request.enabled else None,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="Deployment name already exists") from exc

    meta = get_request_meta(http_request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="deployment.create",
        resource_type="deployment",
        resource_id=row.id,
        namespace=request.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
    return _to_record(row)


@router.get("/{deployment_id}", response_model=DeploymentRecord)
def get_deployment(
    deployment_id: str,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.VIEWER)
    ),
    conn=Depends(get_db),
) -> DeploymentRecord:
    row = metadata_db.get_deployment(conn, deployment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    assert_namespace_role(
        conn=conn,
        current_user=ctx[0],
        namespace=row.namespace,
        min_role=NamespaceRole.VIEWER,
    )
    return _to_record(row)


@router.patch("/{deployment_id}", response_model=DeploymentRecord)
def update_deployment(
    deployment_id: str,
    request: DeploymentUpdateRequest,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> DeploymentRecord:
    fields_set = request.model_fields_set
    row = metadata_db.get_deployment(conn, deployment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    schedule_type = (
        request.schedule_type
        if "schedule_type" in fields_set
        else DeploymentScheduleType(row.schedule_type)
    )
    schedule = request.schedule if "schedule" in fields_set else row.schedule
    _validate_schedule(schedule_type, schedule)
    if "retry_policy" in fields_set:
        _validate_retry_policy(request.retry_policy)

    if request.pipeline_id:
        load_pipeline(row.namespace, request.pipeline_id)

    if request.input_dataset_id:
        dataset = metadata_db.get_dataset(conn, request.input_dataset_id)
        if dataset is None or dataset.namespace != row.namespace:
            raise HTTPException(status_code=400, detail="Invalid input dataset")

    timezone = request.timezone if "timezone" in fields_set else row.timezone
    refresh_schedule = any(
        field in fields_set for field in {"schedule_type", "schedule", "timezone", "enabled"}
    )
    if refresh_schedule and request.enabled is not False:
        temp = _build_temp_row(
            request,
            schedule_type=schedule_type,
            schedule=schedule,
            timezone=timezone,
        )
        try:
            next_run_at = compute_next_run_at(
                temp, after_ts=None, now_ts=metadata_db.utc_now_ts()
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif request.enabled is False:
        next_run_at = None
    else:
        next_run_at = metadata_db._UNSET

    updated = metadata_db.update_deployment(
        conn,
        deployment_id,
        name=request.name if "name" in fields_set else metadata_db._UNSET,
        pipeline_id=request.pipeline_id if "pipeline_id" in fields_set else metadata_db._UNSET,
        enabled=request.enabled if "enabled" in fields_set else metadata_db._UNSET,
        schedule_type=schedule_type.value if "schedule_type" in fields_set else metadata_db._UNSET,
        schedule=schedule if "schedule" in fields_set else metadata_db._UNSET,
        timezone=timezone if "timezone" in fields_set else metadata_db._UNSET,
        input_dataset_id=request.input_dataset_id if "input_dataset_id" in fields_set else metadata_db._UNSET,
        output_to_data_center=request.output_to_data_center if "output_to_data_center" in fields_set else metadata_db._UNSET,
        output_dataset_name_tpl=request.output_dataset_name_tpl if "output_dataset_name_tpl" in fields_set else metadata_db._UNSET,
        misfire_policy=request.misfire_policy.value if "misfire_policy" in fields_set and request.misfire_policy else metadata_db._UNSET,
        max_catchup_runs=request.max_catchup_runs if "max_catchup_runs" in fields_set else metadata_db._UNSET,
        retry_policy=request.retry_policy if "retry_policy" in fields_set else metadata_db._UNSET,
        concurrency_policy=request.concurrency_policy if "concurrency_policy" in fields_set else metadata_db._UNSET,
        next_run_at=next_run_at,
    )

    meta = get_request_meta(http_request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="deployment.update",
        resource_type="deployment",
        resource_id=deployment_id,
        namespace=row.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )
    return _to_record(updated)


@router.delete("/{deployment_id}", status_code=204, response_model=None)
def delete_deployment(
    deployment_id: str,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> None:
    row = metadata_db.get_deployment(conn, deployment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.EDITOR,
    )
    metadata_db.delete_deployment(conn, deployment_id)
    meta = get_request_meta(http_request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="deployment.delete",
        resource_type="deployment",
        resource_id=deployment_id,
        namespace=row.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
    )


@router.post("/{deployment_id}/trigger", status_code=status.HTTP_202_ACCEPTED)
async def trigger_deployment(
    deployment_id: str,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict[str, str]:
    row = metadata_db.get_deployment(conn, deployment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=row.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    run_id = await deployment_scheduler.trigger_deployment(
        row,
        scheduled_for=None,
        triggered_by_user_id=current_user.id,
    )

    meta = get_request_meta(http_request)
    metadata_db.insert_audit_log(
        conn,
        actor_user_id=current_user.id,
        actor_username=current_user.username,
        action="deployment.trigger",
        resource_type="deployment",
        resource_id=deployment_id,
        namespace=row.namespace,
        success=True,
        ip=meta["ip"],
        user_agent=meta["user_agent"],
        request_id=meta["request_id"],
        detail={"run_id": run_id},
    )

    return {"run_id": run_id}
