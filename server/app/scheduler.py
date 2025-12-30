from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from docetl.runner import DSLRunner

from server.app.run_manager import register_run, unregister_run, cancel_run as cancel_active_run
from server.app.storage import metadata_db
from server.app.storage.paths import get_namespace_dir
from server.app.storage.pipeline_store import load_pipeline, update_pipeline_run_status


logger = logging.getLogger(__name__)


_CRONITER_AVAILABLE = True
try:  # pragma: no cover - optional dependency
    from croniter import croniter  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    _CRONITER_AVAILABLE = False


DEFAULT_TIMEZONE = "Asia/Shanghai"
DEFAULT_POLL_SECONDS = 5
DEFAULT_RETRY_BACKOFF_SECONDS = 30
DEFAULT_RETRY_BACKOFF_MULTIPLIER = 2.0
DEFAULT_RETRY_MAX_BACKOFF_SECONDS = 3600


@dataclass
class ScheduledRun:
    deployment: metadata_db.DeploymentRow
    scheduled_for: int


def _parse_timezone(tz: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz or DEFAULT_TIMEZONE)
    except Exception:  # pragma: no cover - invalid tz fallback
        return ZoneInfo(DEFAULT_TIMEZONE)


def _parse_run_at(value: str, tz: ZoneInfo) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid run_at format") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz)
    return parsed.astimezone(tz)


def _interval_seconds(schedule: dict[str, Any]) -> int:
    every = schedule.get("every")
    unit = schedule.get("unit")
    if not isinstance(every, int) or every <= 0:
        raise ValueError("Interval schedule requires positive 'every'")
    if unit not in {"seconds", "minutes", "hours", "days"}:
        raise ValueError("Interval schedule unit must be seconds/minutes/hours/days")
    multiplier = {
        "seconds": 1,
        "minutes": 60,
        "hours": 3600,
        "days": 86400,
    }[unit]
    return every * multiplier


def compute_next_run_at(
    deployment: metadata_db.DeploymentRow,
    *,
    after_ts: int | None,
    now_ts: int,
) -> int | None:
    tz = _parse_timezone(deployment.timezone)
    schedule = deployment.schedule or {}
    if deployment.schedule_type == "once":
        run_at = schedule.get("run_at")
        if not isinstance(run_at, str):
            raise ValueError("Once schedule requires run_at")
        run_dt = _parse_run_at(run_at, tz)
        run_ts = int(run_dt.timestamp())
        if after_ts is not None and run_ts <= after_ts:
            return None
        if run_ts <= now_ts and after_ts is None:
            return run_ts
        return run_ts
    if deployment.schedule_type == "interval":
        interval = _interval_seconds(schedule)
        base = after_ts if after_ts is not None else now_ts
        return base + interval
    if deployment.schedule_type == "cron":
        if not _CRONITER_AVAILABLE:
            raise ValueError("Cron schedules require croniter")
        cron_expr = schedule.get("cron")
        if not isinstance(cron_expr, str) or not cron_expr.strip():
            raise ValueError("Cron schedule requires cron expression")
        base_ts = after_ts if after_ts is not None else now_ts
        base_dt = datetime.fromtimestamp(base_ts, tz)
        return int(croniter(cron_expr, base_dt).get_next(datetime).timestamp())
    raise ValueError("Unsupported schedule type")


def compute_due_runs(
    deployment: metadata_db.DeploymentRow, now_ts: int
) -> tuple[list[int], int | None]:
    next_run_at = deployment.next_run_at
    if next_run_at is None:
        next_run_at = compute_next_run_at(deployment, after_ts=None, now_ts=now_ts)

    if next_run_at is None or next_run_at > now_ts:
        return [], next_run_at

    scheduled_times: list[int] = []
    current = next_run_at
    while current is not None and current <= now_ts:
        scheduled_times.append(current)
        current = compute_next_run_at(deployment, after_ts=current, now_ts=now_ts)
        if (
            deployment.max_catchup_runs
            and len(scheduled_times) >= deployment.max_catchup_runs
        ):
            break

    if deployment.misfire_policy == "skip":
        return [], current
    if deployment.misfire_policy == "run_once":
        scheduled_times = [scheduled_times[-1]] if scheduled_times else []

    return scheduled_times, current


def _max_attempts(retry_policy: dict[str, Any] | None) -> int:
    if not isinstance(retry_policy, dict):
        return 1
    value = retry_policy.get("max_attempts", 1)
    if isinstance(value, bool):
        return 1
    try:
        value_int = int(value)
    except (TypeError, ValueError):
        return 1
    return max(1, value_int)


def compute_retry_delay_seconds(
    retry_policy: dict[str, Any] | None, next_attempt: int
) -> int:
    if next_attempt <= 1:
        return 0
    if not isinstance(retry_policy, dict):
        return 0
    base = retry_policy.get("backoff_seconds", DEFAULT_RETRY_BACKOFF_SECONDS)
    multiplier = retry_policy.get(
        "backoff_multiplier", DEFAULT_RETRY_BACKOFF_MULTIPLIER
    )
    max_backoff = retry_policy.get(
        "max_backoff_seconds", DEFAULT_RETRY_MAX_BACKOFF_SECONDS
    )
    try:
        base_val = float(base)
    except (TypeError, ValueError):
        base_val = float(DEFAULT_RETRY_BACKOFF_SECONDS)
    try:
        multiplier_val = float(multiplier)
    except (TypeError, ValueError):
        multiplier_val = float(DEFAULT_RETRY_BACKOFF_MULTIPLIER)
    try:
        max_backoff_val = float(max_backoff)
    except (TypeError, ValueError):
        max_backoff_val = float(DEFAULT_RETRY_MAX_BACKOFF_SECONDS)

    if base_val <= 0:
        return 0
    if multiplier_val < 1:
        multiplier_val = 1

    delay = base_val * (multiplier_val ** max(0, next_attempt - 2))
    if max_backoff_val > 0:
        delay = min(delay, max_backoff_val)
    return int(delay)


def _notification_settings(
    retry_policy: dict[str, Any] | None,
) -> tuple[bool, bool, str | None]:
    if not isinstance(retry_policy, dict):
        return False, False, None
    notify_on_each = bool(retry_policy.get("notify_on_each_failure", False))
    notify_on_final = bool(retry_policy.get("notify_on_final_failure", False))
    webhook_url = retry_policy.get("notify_webhook_url")
    if isinstance(webhook_url, str) and webhook_url.strip():
        notify_on_final = True
        webhook_url = webhook_url.strip()
    else:
        webhook_url = None
    return notify_on_each, notify_on_final, webhook_url


def _resolve_dataset_path(
    *,
    conn,
    namespace: str,
    input_dataset_id: str | None,
    pipeline_state: dict[str, Any],
) -> str:
    if input_dataset_id:
        dataset = metadata_db.get_dataset(conn, input_dataset_id)
        if dataset is None or dataset.namespace != namespace:
            raise ValueError("Input dataset not found")
        return dataset.path

    current_file = pipeline_state.get("currentFile") or {}
    path = current_file.get("path")
    if not isinstance(path, str) or not path:
        raise ValueError("Pipeline input dataset is missing")
    return path


def _validate_local_path(namespace: str, path_value: str) -> None:
    if "://" in path_value:
        raise ValueError("Non-local paths are not allowed")
    namespace_root = get_namespace_dir(namespace).expanduser().resolve(strict=False)
    candidate = Path(path_value).expanduser().resolve(strict=False)
    try:
        candidate.relative_to(namespace_root)
    except ValueError as exc:
        raise ValueError("Path must be under namespace directory") from exc


def _schema_item_to_string(item: dict[str, Any]) -> str:
    schema_type = item.get("type")
    if schema_type == "list":
        sub = item.get("subType")
        if sub is None:
            raise ValueError("List type must specify subType")
        sub_item = sub[0] if isinstance(sub, list) and sub else sub
        if isinstance(sub_item, dict):
            return f"list[{_schema_item_to_string(sub_item)}]"
        return f"list[{sub_item}]"
    if schema_type == "dict":
        sub = item.get("subType")
        if sub is None:
            raise ValueError("Dict type must specify subType")
        if isinstance(sub, list):
            entries = {entry["key"]: _schema_item_to_string(entry) for entry in sub}
        elif isinstance(sub, dict):
            entries = {entry["key"]: _schema_item_to_string(entry) for entry in sub.values()}
        else:
            raise ValueError("Invalid dict subType")
        inner = ", ".join([f"{key}: {value}" for key, value in entries.items()])
        return f"{{{inner}}}"
    if schema_type == "enum":
        values = item.get("enumValues") or []
        if not values:
            raise ValueError("Enum type must specify enumValues")
        return f"enum[{', '.join(values)}]"
    return str(schema_type)


def build_pipeline_config(
    *,
    namespace: str,
    pipeline_name: str,
    pipeline_state: dict[str, Any],
    input_path: str,
    optimizer_model: str | None,
) -> dict[str, Any]:
    raw_ops = pipeline_state.get("operations") or []
    operations = json.loads(json.dumps(raw_ops)) if isinstance(raw_ops, list) else []
    if not isinstance(operations, list):
        raise ValueError("Invalid pipeline operations")

    sample_size = pipeline_state.get("sampleSize")
    if operations and sample_size is not None:
        operations[0]["sample"] = sample_size

    updated_operations: list[dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        if op.get("visibility") is False:
            continue

        other_kwargs = op.get("otherKwargs") or {}
        if not isinstance(other_kwargs, dict):
            other_kwargs = {}
        new_op: dict[str, Any] = {**op, **other_kwargs}

        new_op.pop("runIndex", None)
        new_op.pop("otherKwargs", None)
        new_op.pop("id", None)
        new_op.pop("llmType", None)
        new_op.pop("visibility", None)
        new_op.pop("shouldOptimizeResult", None)

        litellm_kwargs = new_op.get("litellm_completion_kwargs")
        if isinstance(litellm_kwargs, str):
            try:
                new_op["litellm_completion_kwargs"] = json.loads(litellm_kwargs)
            except Exception:
                pass

        for key, value in list(new_op.items()):
            if isinstance(value, str):
                try:
                    float_val = float(value)
                    if str(float_val) == value:
                        new_op[key] = float_val
                        continue
                except ValueError:
                    pass
                try:
                    int_val = int(value)
                    if str(int_val) == value:
                        new_op[key] = int_val
                except ValueError:
                    pass

        gleaning = new_op.get("gleaning")
        if isinstance(gleaning, dict):
            if gleaning.get("num_rounds", 0) == 0 or not gleaning.get("validation_prompt"):
                new_op.pop("gleaning", None)

        if new_op.get("type") == "sample" and other_kwargs.get("method") == "custom":
            samples = other_kwargs.get("samples")
            if isinstance(samples, str):
                try:
                    new_op["samples"] = json.loads(samples)
                except Exception:
                    new_op["samples"] = samples

        output = new_op.get("output") if isinstance(new_op.get("output"), dict) else None
        schema_items = output.get("schema") if output else None
        if isinstance(schema_items, list):
            schema_map: dict[str, str] = {}
            for item in schema_items:
                if not isinstance(item, dict) or "key" not in item:
                    continue
                schema_map[item["key"]] = _schema_item_to_string(item)
            new_op["output"] = {"schema": schema_map}

        new_op["enable_observability"] = True
        updated_operations.append(new_op)

    if not updated_operations:
        raise ValueError("No valid operations found in pipeline")

    visible_ops = [op for op in operations if isinstance(op, dict) and op.get("visibility") is not False]
    if not visible_ops:
        raise ValueError("Pipeline has no visible operations")
    last_op = visible_ops[-1]
    try:
        last_index = operations.index(last_op)
    except ValueError:
        last_index = len(operations) - 1

    operations_to_run = [
        op for op in operations[: last_index + 1] if isinstance(op, dict) and op.get("visibility") is not False
    ]

    datasets = {"input": {"type": "file", "path": input_path, "source": "local"}}

    namespace_dir = get_namespace_dir(namespace)
    output_path = namespace_dir / "pipelines" / "outputs" / f"{pipeline_name}.json"
    intermediate_dir = namespace_dir / "pipelines" / pipeline_name / "intermediates"

    pipeline_config: dict[str, Any] = {
        "from_docwrangler": True,
        "optimizer_model": optimizer_model or pipeline_state.get("optimizerModel"),
        "datasets": datasets,
        "default_model": pipeline_state.get("defaultModel", "gpt-5-nano"),
        "optimizer_config": {"force_decompose": True},
        "operations": updated_operations,
        "pipeline": {
            "steps": [
                {
                    "name": "data_processing",
                    "input": "input",
                    "operations": [op["name"] for op in operations_to_run if "name" in op],
                }
            ],
            "output": {
                "type": "file",
                "path": str(output_path),
                "intermediate_dir": str(intermediate_dir),
            },
        },
        "system_prompt": {},
    }

    system_prompt = pipeline_state.get("systemPrompt") or {}
    if isinstance(system_prompt, dict):
        if system_prompt.get("datasetDescription"):
            pipeline_config["system_prompt"]["dataset_description"] = system_prompt["datasetDescription"]
        if system_prompt.get("persona"):
            pipeline_config["system_prompt"]["persona"] = system_prompt["persona"]

    extra_settings = pipeline_state.get("extraPipelineSettings")
    if isinstance(extra_settings, dict):
        pipeline_config.update(extra_settings)

    _validate_local_path(namespace, input_path)
    _validate_local_path(namespace, str(output_path))
    _validate_local_path(namespace, str(intermediate_dir))

    return pipeline_config


def _render_dataset_name(template: str | None, pipeline_name: str, run_id: str) -> str:
    if not template:
        return f"{pipeline_name}_run_{run_id}"
    now = datetime.now(timezone.utc)
    return (
        template.replace("{{pipeline_name}}", pipeline_name)
        .replace("{{run_id}}", run_id)
        .replace("{{date}}", now.strftime("%Y%m%d"))
    )


def _register_generated_dataset(
    *,
    conn,
    namespace: str,
    output_path: str,
    pipeline_id: str | None,
    pipeline_name: str,
    run_id: str,
    name_template: str | None,
) -> str:
    path = Path(output_path)
    if not path.exists():
        raise ValueError("Pipeline output file not found")

    suffix = path.suffix.lower()
    content = path.read_bytes()
    if suffix == ".json":
        records = json.loads(content.decode("utf-8"))
        original_format = "json"
        if isinstance(records, dict):
            records = [records]
    elif suffix == ".csv":
        import csv
        from io import StringIO

        csv_string = content.decode("utf-8")
        records = list(csv.DictReader(StringIO(csv_string)))
        original_format = "csv"
    else:
        raise ValueError("Unsupported output format")

    dataset_id = str(uuid.uuid4())
    dataset_path = (
        get_namespace_dir(namespace)
        / "data_center"
        / "datasets"
        / "generated"
        / f"{dataset_id}.json"
    )
    dataset_path.parent.mkdir(parents=True, exist_ok=True)
    with dataset_path.open("w", encoding="utf-8") as handle:
        json.dump(records, handle, ensure_ascii=True, indent=2)

    schema = None
    if records and isinstance(records, list) and isinstance(records[0], dict):
        schema = {
            "fields": [
                {"name": key, "type": type(value).__name__}
                for key, value in records[0].items()
            ]
        }

    metadata_db.create_dataset(
        conn,
        dataset_id=dataset_id,
        namespace=namespace,
        name=_render_dataset_name(name_template, pipeline_name, run_id),
        source="pipeline_generated",
        format="json",
        original_format=original_format,
        raw_path=str(path),
        path=str(dataset_path),
        ingest_status="ready",
        schema=schema,
        row_count=len(records) if isinstance(records, list) else None,
        lineage={
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "run_id": run_id,
            "output_path": output_path,
        },
    )
    return dataset_id


class DeploymentScheduler:
    def __init__(self, poll_seconds: int = DEFAULT_POLL_SECONDS) -> None:
        self._poll_seconds = poll_seconds
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if self._task is not None:
            return
        if str(os.getenv("DOCETL_DISABLE_SCHEDULER", "")).lower() == "true":
            logger.info("Deployment scheduler disabled by environment")
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        self._stop_event.set()
        await self._task
        self._task = None

    async def trigger_deployment(
        self,
        deployment: metadata_db.DeploymentRow,
        *,
        scheduled_for: int | None = None,
        triggered_by_user_id: str | None = None,
    ) -> str:
        pipeline = load_pipeline(deployment.namespace, deployment.pipeline_id)
        conn = metadata_db.get_connection()
        try:
            max_attempts = _max_attempts(deployment.retry_policy)
            run_row = metadata_db.create_run(
                conn,
                namespace=deployment.namespace,
                pipeline_id=deployment.pipeline_id,
                pipeline_name=pipeline.name,
                trigger="deployment",
                deployment_id=deployment.id,
                status="running",
                scheduled_for=scheduled_for,
                triggered_by_user_id=triggered_by_user_id,
                attempt=1,
                max_attempts=max_attempts,
            )
            metadata_db.update_deployment(
                conn,
                deployment.id,
                last_run_id=run_row.id,
            )
            conn.commit()
        finally:
            conn.close()

        asyncio.create_task(self._execute_run(deployment, run_row.id))
        return run_row.id

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except Exception as exc:  # pragma: no cover - defensive
                logger.exception("Deployment scheduler tick failed: %s", exc)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_seconds)
            except asyncio.TimeoutError:
                continue

    async def _tick(self) -> None:
        now_ts = metadata_db.utc_now_ts()
        conn = metadata_db.get_connection()
        try:
            deployments = metadata_db.list_deployments(conn, namespace=None, enabled_only=False)
        except Exception:
            deployments = []
        finally:
            conn.close()

        for deployment in deployments:
            if not deployment.enabled:
                continue
            try:
                due_times, next_run_at = compute_due_runs(deployment, now_ts)
            except Exception as exc:
                logger.warning("Failed to compute schedule for deployment %s: %s", deployment.id, exc)
                continue

            if due_times:
                for scheduled_for in due_times:
                    await self._schedule_run(deployment, scheduled_for)
                conn = metadata_db.get_connection()
                try:
                    if deployment.schedule_type == "once":
                        metadata_db.update_deployment(
                            conn,
                            deployment.id,
                            enabled=False,
                            next_run_at=None,
                        )
                    else:
                        metadata_db.update_deployment(
                            conn,
                            deployment.id,
                            next_run_at=next_run_at,
                        )
                    conn.commit()
                finally:
                    conn.close()
            elif next_run_at is not None and next_run_at != deployment.next_run_at:
                conn = metadata_db.get_connection()
                try:
                    metadata_db.update_deployment(
                        conn,
                        deployment.id,
                        next_run_at=next_run_at,
                    )
                    conn.commit()
                finally:
                    conn.close()

    async def _schedule_run(self, deployment: metadata_db.DeploymentRow, scheduled_for: int) -> None:
        conn = metadata_db.get_connection()
        try:
            existing = metadata_db.get_run_for_schedule(
                conn,
                deployment_id=deployment.id,
                scheduled_for=scheduled_for,
            )
            if existing is not None:
                return

            if not self._can_schedule(conn, deployment):
                return

            pipeline = load_pipeline(deployment.namespace, deployment.pipeline_id)
            max_attempts = _max_attempts(deployment.retry_policy)
            run_row = metadata_db.create_run(
                conn,
                namespace=deployment.namespace,
                pipeline_id=deployment.pipeline_id,
                pipeline_name=pipeline.name,
                trigger="deployment",
                deployment_id=deployment.id,
                status="running",
                scheduled_for=scheduled_for,
                attempt=1,
                max_attempts=max_attempts,
            )
            metadata_db.update_deployment(conn, deployment.id, last_run_id=run_row.id)
            conn.commit()
        finally:
            conn.close()

        asyncio.create_task(self._execute_run(deployment, run_row.id))

    def _can_schedule(
        self,
        conn,
        deployment: metadata_db.DeploymentRow,
    ) -> bool:
        policy = deployment.concurrency_policy or {}
        namespace_max = policy.get("namespace_max")
        pipeline_max = policy.get("pipeline_max")
        on_conflict = policy.get("on_conflict", "skip")

        if namespace_max is not None:
            if metadata_db.count_active_runs(conn, namespace=deployment.namespace) >= int(namespace_max):
                return self._handle_conflict(conn, deployment, on_conflict)
        if pipeline_max is not None:
            if metadata_db.count_active_runs(
                conn, namespace=deployment.namespace, pipeline_id=deployment.pipeline_id
            ) >= int(pipeline_max):
                return self._handle_conflict(conn, deployment, on_conflict)
        return True

    def _handle_conflict(
        self,
        conn,
        deployment: metadata_db.DeploymentRow,
        on_conflict: str,
    ) -> bool:
        if on_conflict == "replace":
            active_runs = metadata_db.list_active_runs(
                conn,
                namespace=deployment.namespace,
                pipeline_id=deployment.pipeline_id,
            )
            for run in active_runs:
                cancel_active_run(run.id)
            return True
        return False

    async def _run_retry_after(
        self,
        *,
        deployment_id: str,
        run_id: str,
        delay_seconds: int,
    ) -> None:
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)
        conn = metadata_db.get_connection()
        try:
            deployment = metadata_db.get_deployment(conn, deployment_id)
            run_row = metadata_db.get_run(conn, run_id)
            if run_row is None:
                return
            if deployment is None or not deployment.enabled:
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="cancelled",
                    ended_at=metadata_db.utc_now_ts(),
                    error="Deployment disabled",
                )
                conn.commit()
                return
            if not self._can_schedule(conn, deployment):
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="cancelled",
                    ended_at=metadata_db.utc_now_ts(),
                    error="Retry skipped due to concurrency policy",
                )
                conn.commit()
                return
        finally:
            conn.close()

        await self._execute_run(deployment, run_id)

    async def _send_failure_notification(
        self,
        *,
        deployment: metadata_db.DeploymentRow,
        run_id: str,
        pipeline_name: str,
        error_message: str,
        attempt: int,
        max_attempts: int,
    ) -> None:
        notify_on_each, notify_on_final, webhook_url = _notification_settings(
            deployment.retry_policy
        )
        should_notify = notify_on_each or (notify_on_final and attempt >= max_attempts)
        if not should_notify:
            return

        payload = {
            "deployment_id": deployment.id,
            "pipeline_id": deployment.pipeline_id,
            "pipeline_name": pipeline_name,
            "run_id": run_id,
            "namespace": deployment.namespace,
            "attempt": attempt,
            "max_attempts": max_attempts,
            "error": error_message,
        }
        success = True
        error_detail: str | None = None

        if webhook_url:
            try:
                import httpx

                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.post(webhook_url, json=payload)
            except Exception as exc:  # pragma: no cover - network failure
                success = False
                error_detail = str(exc)
                logger.warning("Failed to send deployment alert: %s", exc)

        conn = metadata_db.get_connection()
        try:
            metadata_db.insert_audit_log(
                conn,
                actor_user_id=None,
                actor_username=None,
                action="deployment.alert",
                resource_type="deployment",
                resource_id=deployment.id,
                namespace=deployment.namespace,
                success=success,
                detail={
                    **payload,
                    "webhook_url": webhook_url,
                    "notify_error": error_detail,
                },
            )
            conn.commit()
        finally:
            conn.close()

    async def _execute_run(self, deployment: metadata_db.DeploymentRow, run_id: str) -> None:
        runner: DSLRunner | None = None
        attempt = 1
        max_attempts = _max_attempts(deployment.retry_policy)
        pipeline_name = deployment.pipeline_id
        try:
            conn = metadata_db.get_connection()
            try:
                run_row = metadata_db.get_run(conn, run_id)
                if run_row is None:
                    return
                if run_row.status == "cancelled":
                    return
                attempt = run_row.attempt
                max_attempts = run_row.max_attempts or max_attempts
                pipeline = load_pipeline(deployment.namespace, deployment.pipeline_id)
                pipeline_name = pipeline.name
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="running",
                    started_at=metadata_db.utc_now_ts(),
                )
                input_path = _resolve_dataset_path(
                    conn=conn,
                    namespace=deployment.namespace,
                    input_dataset_id=deployment.input_dataset_id,
                    pipeline_state=pipeline.state,
                )
                config = build_pipeline_config(
                    namespace=deployment.namespace,
                    pipeline_name=pipeline.name,
                    pipeline_state=pipeline.state,
                    input_path=input_path,
                    optimizer_model=pipeline.state.get("optimizerModel"),
                )
                conn.commit()
            finally:
                conn.close()

            runner = DSLRunner(config)

            def _cancel() -> None:
                if runner is not None:
                    runner.is_cancelled = True

            register_run(run_id, _cancel)
            update_pipeline_run_status(deployment.namespace, deployment.pipeline_id, "running")

            cost = await asyncio.to_thread(runner.load_run_save)
            output_path = runner.get_output_path()

            conn = metadata_db.get_connection()
            try:
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="completed",
                    ended_at=metadata_db.utc_now_ts(),
                    cost=cost,
                    output_path=output_path,
                )
                metadata_db.insert_audit_log(
                    conn,
                    actor_user_id=None,
                    actor_username=None,
                    action="run.complete",
                    resource_type="run",
                    resource_id=run_id,
                    namespace=deployment.namespace,
                    success=True,
                    detail={"cost": cost},
                )
                if deployment.output_to_data_center and output_path:
                    dataset_id = _register_generated_dataset(
                        conn=conn,
                        namespace=deployment.namespace,
                        output_path=output_path,
                        pipeline_id=deployment.pipeline_id,
                        pipeline_name=pipeline.name,
                        run_id=run_id,
                        name_template=deployment.output_dataset_name_tpl,
                    )
                    metadata_db.insert_audit_log(
                        conn,
                        actor_user_id=None,
                        actor_username=None,
                        action="dataset.generated",
                        resource_type="dataset",
                        resource_id=dataset_id,
                        namespace=deployment.namespace,
                        success=True,
                        detail={"output_path": output_path},
                    )
                conn.commit()
            finally:
                conn.close()

            update_pipeline_run_status(deployment.namespace, deployment.pipeline_id, "completed")
        except Exception as exc:  # pragma: no cover - runtime errors
            conn = metadata_db.get_connection()
            try:
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="failed",
                    ended_at=metadata_db.utc_now_ts(),
                    error=str(exc),
                )
                metadata_db.insert_audit_log(
                    conn,
                    actor_user_id=None,
                    actor_username=None,
                    action="run.fail",
                    resource_type="run",
                    resource_id=run_id,
                    namespace=deployment.namespace,
                    success=False,
                    detail={"error": str(exc)},
                )
                conn.commit()
            finally:
                conn.close()
            update_pipeline_run_status(deployment.namespace, deployment.pipeline_id, "failed")
            logger.warning("Deployment run %s failed: %s", run_id, exc)
            await self._send_failure_notification(
                deployment=deployment,
                run_id=run_id,
                pipeline_name=pipeline_name,
                error_message=str(exc),
                attempt=attempt,
                max_attempts=max_attempts,
            )
            if attempt < max_attempts:
                delay = compute_retry_delay_seconds(
                    deployment.retry_policy, attempt + 1
                )
                conn = metadata_db.get_connection()
                try:
                    retry_run = metadata_db.create_run(
                        conn,
                        namespace=deployment.namespace,
                        pipeline_id=deployment.pipeline_id,
                        pipeline_name=pipeline_name,
                        trigger="deployment",
                        deployment_id=deployment.id,
                        status="pending",
                        scheduled_for=metadata_db.utc_now_ts() + delay,
                        attempt=attempt + 1,
                        max_attempts=max_attempts,
                        metadata={
                            "retry_of": run_id,
                            "attempt": attempt + 1,
                            "last_error": str(exc),
                        },
                    )
                    metadata_db.update_deployment(
                        conn,
                        deployment.id,
                        last_run_id=retry_run.id,
                    )
                    metadata_db.insert_audit_log(
                        conn,
                        actor_user_id=None,
                        actor_username=None,
                        action="run.retry_scheduled",
                        resource_type="run",
                        resource_id=retry_run.id,
                        namespace=deployment.namespace,
                        success=True,
                        detail={
                            "previous_run_id": run_id,
                            "next_attempt": attempt + 1,
                            "delay_seconds": delay,
                        },
                    )
                    conn.commit()
                finally:
                    conn.close()
                asyncio.create_task(
                    self._run_retry_after(
                        deployment_id=deployment.id,
                        run_id=retry_run.id,
                        delay_seconds=delay,
                    )
                )
        finally:
            unregister_run(run_id)
            if runner is not None:
                runner.reset_env()


deployment_scheduler = DeploymentScheduler()
