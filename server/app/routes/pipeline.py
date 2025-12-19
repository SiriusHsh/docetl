from __future__ import annotations

from typing import Any
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from docetl.runner import DSLRunner
import asyncio
from asyncio import Task
from rich.logging import RichHandler
import logging
from datetime import datetime, timedelta
import yaml

from server.app.deps import get_db
from server.app.models import (
    NamespaceRole,
    OptimizeResult,
    OptimizeRequest,
    PipelineRequest,
    PlatformRole,
    TaskStatus,
)
from server.app.security import (
    CurrentUser,
    assert_namespace_role,
    get_current_user,
    get_current_user_from_token,
    get_request_meta,
    resolve_docetl_namespace_for_path,
    validate_namespace,
)
from server.app.storage import paths as storage_paths
from server.app.storage import metadata_db
from server.app.run_manager import register_run, unregister_run
from server.app.storage.pipeline_store import load_pipeline, update_pipeline_run_status

# Setup logging
FORMAT = "%(message)s"
logging.basicConfig(
    level="INFO", format=FORMAT, datefmt="[%X]", handlers=[RichHandler()]
)

router = APIRouter()

# Task storage
tasks: dict[str, OptimizeResult] = {}
asyncio_tasks: dict[str, Task] = {}
task_owners: dict[str, str] = {}

# Configuration
COMPLETED_TASK_TTL = timedelta(hours=1)


def _validate_pipeline_config_paths(*, namespace: str, yaml_path: Path) -> None:
    """Ensure YAML config only references paths under `~/.docetl/<namespace>`."""
    try:
        raw = yaml.safe_load(yaml_path.read_text())
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid pipeline YAML config") from exc

    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Invalid pipeline YAML config")

    namespace_root = (storage_paths.get_docetl_root_dir() / namespace).expanduser().resolve(strict=False)

    def _assert_local_path(path_value: Any, label: str) -> None:
        if path_value is None:
            return
        if not isinstance(path_value, str) or not path_value.strip():
            raise HTTPException(status_code=400, detail=f"Invalid {label} path in pipeline config")
        if "://" in path_value:
            raise HTTPException(status_code=400, detail=f"Non-local paths are not allowed for {label}")
        candidate = Path(path_value).expanduser()
        if not candidate.is_absolute():
            raise HTTPException(status_code=400, detail=f"{label} path must be absolute")
        resolved = candidate.resolve(strict=False)
        try:
            resolved.relative_to(namespace_root)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"{label} path must be under the namespace directory",
            ) from exc

    pipeline_out = raw.get("pipeline", {}).get("output", {}) if isinstance(raw.get("pipeline"), dict) else {}
    if isinstance(pipeline_out, dict):
        _assert_local_path(pipeline_out.get("path"), "pipeline.output.path")
        _assert_local_path(pipeline_out.get("intermediate_dir"), "pipeline.output.intermediate_dir")

    datasets = raw.get("datasets")
    if isinstance(datasets, dict):
        for dataset_name, dataset in datasets.items():
            if not isinstance(dataset, dict):
                continue
            if dataset.get("type") == "file":
                _assert_local_path(dataset.get("path"), f"datasets.{dataset_name}.path")


def _authorize_yaml_path(
    *,
    conn,
    current_user: CurrentUser,
    yaml_config: str,
    min_role: NamespaceRole,
) -> tuple[str, Path]:
    namespace, yaml_path = resolve_docetl_namespace_for_path(yaml_config)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=min_role,
    )
    if not yaml_path.exists():
        raise HTTPException(status_code=404, detail="Pipeline config not found")
    _validate_pipeline_config_paths(namespace=namespace, yaml_path=yaml_path)
    return namespace, yaml_path


def _record_run_status(config: dict[str, Any] | PipelineRequest, status: str) -> None:
    """Persist the last run status for a pipeline if identifiers are present."""
    if isinstance(config, PipelineRequest):
        pipeline_id = config.pipeline_id
        namespace = config.namespace
    else:
        pipeline_id = config.get("pipeline_id")
        namespace = config.get("namespace")

    if not pipeline_id or not namespace:
        return

    try:
        update_pipeline_run_status(namespace, pipeline_id, status)
    except Exception as exc:  # pragma: no cover - avoid breaking runs on status failures
        logging.warning("Failed to update pipeline status: %s", exc)


def _resolve_pipeline_name(namespace: str, pipeline_id: str | None, yaml_path: Path) -> str | None:
    if pipeline_id:
        try:
            record = load_pipeline(namespace, pipeline_id)
            return record.name
        except Exception:
            return yaml_path.stem
    return yaml_path.stem


def _now_ts() -> int:
    return metadata_db.utc_now_ts()

async def cleanup_old_tasks():
    """Background task to clean up completed tasks"""
    while True:
        try:
            current_time = datetime.now()
            task_ids_to_remove = []

            for task_id, task in tasks.items():
                if (task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED] and
                    task.completed_at and 
                    current_time - task.completed_at > COMPLETED_TASK_TTL):
                    task_ids_to_remove.append(task_id)

            for task_id in task_ids_to_remove:
                del tasks[task_id]
                task_owners.pop(task_id, None)
                
            await asyncio.sleep(60)
            
        except Exception as e:
            logging.error(f"Error in cleanup task: {e}")
            await asyncio.sleep(60)

async def run_optimization(task_id: str, yaml_config: str, step_name: str, op_name: str):
    """Execute the optimization task"""
    runner: DSLRunner | None = None
    try:
        tasks[task_id].status = TaskStatus.PROCESSING
        
        # Run the actual optimization in a separate thread to not block
        runner = DSLRunner.from_yaml(yaml_config)
        should_optimize, input_data, output_data, cost = await asyncio.to_thread(
            runner.should_optimize,
            step_name,
            op_name,
        )
        
        # Update task result
        tasks[task_id].status = TaskStatus.COMPLETED
        tasks[task_id].should_optimize = should_optimize
        tasks[task_id].input_data = input_data
        tasks[task_id].output_data = output_data
        tasks[task_id].cost = cost
        tasks[task_id].completed_at = datetime.now()
        
    except asyncio.CancelledError:
        if runner is not None:
            runner.is_cancelled = True
        tasks[task_id].status = TaskStatus.CANCELLED
        tasks[task_id].completed_at = datetime.now()
        raise
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        tasks[task_id].status = TaskStatus.FAILED
        tasks[task_id].error = f"{str(e)}\n{error_traceback}"
        tasks[task_id].completed_at = datetime.now()
        raise
    
    finally:
        if task_id in asyncio_tasks:
            del asyncio_tasks[task_id]
        if runner is not None:
            runner.reset_env()

@router.on_event("startup")
async def startup_event():
    """Start the cleanup task when the application starts"""
    asyncio.create_task(cleanup_old_tasks())

@router.post("/should_optimize", status_code=202)
async def submit_optimize_task(
    request: OptimizeRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    """Submit a new optimization task"""
    _, yaml_path = _authorize_yaml_path(
        conn=conn,
        current_user=current_user,
        yaml_config=request.yaml_config,
        min_role=NamespaceRole.EDITOR,
    )
    task_id = str(uuid.uuid4())

    # Create task record
    tasks[task_id] = OptimizeResult(
        task_id=task_id,
        status=TaskStatus.PENDING,
        created_at=datetime.now()
    )
    task_owners[task_id] = current_user.id

    # Create and store the asyncio task
    task = asyncio.create_task(
        run_optimization(
            task_id,
            str(yaml_path),
            request.step_name,
            request.op_name
        )
    )
    asyncio_tasks[task_id] = task
    
    return {"task_id": task_id}

@router.get("/should_optimize/{task_id}")
async def get_optimize_status(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> OptimizeResult:
    """Get the current status of an optimization task"""
    if task_id not in tasks:
        raise HTTPException(
            status_code=404, 
            detail="Task not found or has been cleaned up"
        )

    owner = task_owners.get(task_id)
    if current_user.platform_role != PlatformRole.PLATFORM_ADMIN and owner != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to access this task")
    
    return tasks[task_id]

@router.post("/should_optimize/{task_id}/cancel")
async def cancel_optimize_task(
    task_id: str,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Cancel a running optimization task"""
    if task_id not in tasks:
        raise HTTPException(
            status_code=404, 
            detail="Task not found or has been cleaned up"
        )

    owner = task_owners.get(task_id)
    if current_user.platform_role != PlatformRole.PLATFORM_ADMIN and owner != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to cancel this task")
    
    if task_id not in asyncio_tasks:
        raise HTTPException(
            status_code=400, 
            detail="Task already finished or cannot be cancelled"
        )
    
    asyncio_task = asyncio_tasks[task_id]
    asyncio_task.cancel()
    
    try:
        await asyncio_task
    except asyncio.CancelledError:
        pass
    
    return {"message": "Task cancelled successfully"}

# Keep the original run_pipeline endpoint
@router.post("/run_pipeline")
def run_pipeline(
    request: PipelineRequest,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> dict[str, Any]:
    namespace, yaml_path = _authorize_yaml_path(
        conn=conn,
        current_user=current_user,
        yaml_config=request.yaml_config,
        min_role=NamespaceRole.EDITOR,
    )
    runner: DSLRunner | None = None
    run_id: str | None = None
    pipeline_name = _resolve_pipeline_name(namespace, request.pipeline_id, yaml_path)
    try:
        _record_run_status(
            {"pipeline_id": request.pipeline_id, "namespace": namespace}, "running"
        )
        meta = get_request_meta(http_request)
        try:
            run_row = metadata_db.create_run(
                conn,
                namespace=namespace,
                pipeline_id=request.pipeline_id,
                pipeline_name=pipeline_name,
                trigger="manual",
                status="running",
                triggered_by_user_id=current_user.id,
                metadata={"yaml_config": str(yaml_path)},
            )
            run_id = run_row.id
            metadata_db.insert_audit_log(
                conn,
                actor_user_id=current_user.id,
                actor_username=current_user.username,
                action="run.start",
                resource_type="run",
                resource_id=run_id,
                namespace=namespace,
                success=True,
                ip=meta["ip"],
                user_agent=meta["user_agent"],
                request_id=meta["request_id"],
            )
        except Exception as exc:
            logging.warning("Failed to record run metadata: %s", exc)
        runner = DSLRunner.from_yaml(str(yaml_path))
        cost = runner.load_run_save()
        _record_run_status(
            {"pipeline_id": request.pipeline_id, "namespace": namespace}, "completed"
        )
        if run_id:
            try:
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="completed",
                    ended_at=_now_ts(),
                    cost=cost,
                )
                metadata_db.insert_audit_log(
                    conn,
                    actor_user_id=current_user.id,
                    actor_username=current_user.username,
                    action="run.complete",
                    resource_type="run",
                    resource_id=run_id,
                    namespace=namespace,
                    success=True,
                    ip=meta["ip"],
                    user_agent=meta["user_agent"],
                    request_id=meta["request_id"],
                    detail={"cost": cost},
                )
            except Exception as exc:
                logging.warning("Failed to update run metadata: %s", exc)
        return {"cost": cost, "message": "Pipeline executed successfully", "run_id": run_id}
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"Error occurred:\n{e}\n{error_traceback}")
        _record_run_status(
            {"pipeline_id": request.pipeline_id, "namespace": namespace}, "failed"
        )
        if run_id:
            try:
                metadata_db.update_run(
                    conn,
                    run_id,
                    status="failed",
                    ended_at=_now_ts(),
                    error=str(e),
                )
                meta = get_request_meta(http_request)
                metadata_db.insert_audit_log(
                    conn,
                    actor_user_id=current_user.id,
                    actor_username=current_user.username,
                    action="run.fail",
                    resource_type="run",
                    resource_id=run_id,
                    namespace=namespace,
                    success=False,
                    ip=meta["ip"],
                    user_agent=meta["user_agent"],
                    request_id=meta["request_id"],
                    detail={"error": str(e)},
                )
            except Exception as exc:
                logging.warning("Failed to update run metadata: %s", exc)
        raise HTTPException(status_code=500, detail=str(e) + "\n" + error_traceback)
    finally:
        if runner is not None:
            runner.reset_env()

@router.websocket("/ws/run_pipeline/{client_id}")
async def websocket_run_pipeline(websocket: WebSocket, client_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        namespace_value = validate_namespace(client_id)
    except HTTPException:
        await websocket.close(code=1008)
        return

    db_gen = get_db()
    conn = next(db_gen)
    try:
        current_user = get_current_user_from_token(conn, token)
        assert_namespace_role(
            conn=conn,
            current_user=current_user,
            namespace=namespace_value,
            min_role=NamespaceRole.EDITOR,
        )
    except HTTPException:
        await websocket.close(code=1008)
        return
    finally:
        db_gen.close()

    await websocket.accept()
    runner: DSLRunner | None = None
    config: dict[str, Any] = {}
    run_id: str | None = None
    pipeline_task: asyncio.Task | None = None

    def _with_conn(fn):
        db_gen = get_db()
        conn = next(db_gen)
        try:
            return fn(conn)
        finally:
            db_gen.close()

    def _create_run_record(
        *,
        namespace: str,
        pipeline_id: str | None,
        pipeline_name: str | None,
        metadata: dict[str, Any],
    ) -> str | None:
        try:
            row = _with_conn(
                lambda conn: metadata_db.create_run(
                    conn,
                    namespace=namespace,
                    pipeline_id=pipeline_id,
                    pipeline_name=pipeline_name,
                    trigger="manual",
                    status="running",
                    triggered_by_user_id=current_user.id,
                    metadata=metadata,
                )
            )
            return row.id if row else None
        except Exception as exc:
            logging.warning("Failed to create run record: %s", exc)
            return None

    def _update_run_record(**fields: Any) -> None:
        if not run_id:
            return
        try:
            _with_conn(lambda conn: metadata_db.update_run(conn, run_id, **fields))
        except Exception as exc:
            logging.warning("Failed to update run record: %s", exc)

    def _audit_run(action: str, success: bool, detail: dict[str, Any] | None = None) -> None:
        if not run_id:
            return
        try:
            _with_conn(
                lambda conn: metadata_db.insert_audit_log(
                    conn,
                    actor_user_id=current_user.id,
                    actor_username=current_user.username,
                    action=action,
                    resource_type="run",
                    resource_id=run_id,
                    namespace=namespace_value,
                    success=success,
                    detail=detail,
                )
            )
        except Exception as exc:
            logging.warning("Failed to write run audit log: %s", exc)

    try:
        config = await websocket.receive_json()
        yaml_config = config.get("yaml_config")
        if not isinstance(yaml_config, str) or not yaml_config:
            await websocket.send_json({"type": "error", "data": "yaml_config is required"})
            return

        yaml_namespace, yaml_path = resolve_docetl_namespace_for_path(yaml_config)
        if yaml_namespace != namespace_value:
            await websocket.send_json({"type": "error", "data": "yaml_config namespace mismatch"})
            return
        if not yaml_path.exists():
            await websocket.send_json({"type": "error", "data": "Pipeline config not found"})
            return
        _validate_pipeline_config_paths(namespace=namespace_value, yaml_path=yaml_path)

        config["namespace"] = namespace_value
        pipeline_name = _resolve_pipeline_name(
            namespace_value,
            str(config.get("pipeline_id")) if config.get("pipeline_id") else None,
            yaml_path,
        )
        run_id = _create_run_record(
            namespace=namespace_value,
            pipeline_id=str(config.get("pipeline_id")) if config.get("pipeline_id") else None,
            pipeline_name=pipeline_name,
            metadata={
                "yaml_config": str(yaml_path),
                "optimize": bool(config.get("optimize", False)),
                "clear_intermediate": bool(config.get("clear_intermediate", False)),
            },
        )
        if run_id:
            _audit_run("run.start", True)

        runner = DSLRunner.from_yaml(str(yaml_path))

        if config.get("clear_intermediate", False):
            runner.clear_intermediate()

        if config.get("optimize", False):
            logging.info(f"Optimizing pipeline with model {config.get('optimizer_model', 'gpt-4o')}")

            # Set the runner config to the optimizer config
            runner.config["optimizer_config"]["rewrite_agent_model"] = config.get("optimizer_model", "gpt-4o")
            runner.config["optimizer_config"]["judge_agent_model"] = config.get("optimizer_model", "gpt-4o-mini")

            async def run_pipeline():
                return await asyncio.to_thread(runner.optimize, return_pipeline=False)

        else:
            async def run_pipeline():
                return await asyncio.to_thread(runner.load_run_save)

        _record_run_status(config, "running")
        pipeline_task = asyncio.create_task(run_pipeline())

        if run_id:
            def _cancel_run() -> None:
                if runner is not None:
                    runner.is_cancelled = True
                if pipeline_task is not None and not pipeline_task.done():
                    pipeline_task.cancel()

            register_run(run_id, _cancel_run)

        while not pipeline_task.done():
            console_output = runner.console.file.getvalue()
            await websocket.send_json({"type": "output", "data": console_output})

            if config.get("optimize", False):
                optimizer_progress = runner.console.get_optimizer_progress()
                rationale = runner.console.optimizer_rationale
                await websocket.send_json({
                    "type": "optimizer_progress",
                    "status": optimizer_progress[0],
                    "progress": optimizer_progress[1],
                    "rationale": rationale[1] if rationale is not None else "",
                    "should_optimize": rationale[0] if rationale is not None else False,
                    "validator_prompt": rationale[2] if rationale is not None else "",
                })

            # Check for incoming messages from the user
            try:
                user_message = await asyncio.wait_for(
                    websocket.receive_json(), timeout=0.1
                )

                if user_message == "kill":
                    runner.console.log("Stopping process...")
                    runner.is_cancelled = True

                    await websocket.send_json({
                        "type": "error",
                        "message": "Process stopped by user request",
                    })
                    raise Exception("Process stopped by user request")

                # Process the user message and send it to the runner
                runner.console.post_input(user_message)
            except asyncio.TimeoutError:
                pass  # No message received, continue with the loop
            except asyncio.CancelledError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Process stopped by user request",
                })
                raise

            await asyncio.sleep(0.5)

        # Final check to send any remaining output
        result = await pipeline_task

        console_output = runner.console.file.getvalue()
        if console_output:
            await websocket.send_json({"type": "output", "data": console_output})

        # Sleep for a short duration to ensure all output is captured
        await asyncio.sleep(3)

        # If optimize is true, send back the optimized operations
        if config.get("optimize", False):
            optimized_config, cost = result

            # Send the operations back in order
            new_pipeline_steps = optimized_config["pipeline"]["steps"]
            new_pipeline_op_name_to_op_map = {op["name"]: op for op in optimized_config["operations"]}
            new_ops_in_order = []
            for new_step in new_pipeline_steps:
                for op in new_step.get("operations", []):
                    if op not in new_ops_in_order:
                        new_ops_in_order.append(new_pipeline_op_name_to_op_map[op])

            await websocket.send_json(
                {
                    "type": "result",
                    "data": {
                        "message": "Pipeline executed successfully",
                        "cost": cost,
                        "optimized_ops": new_ops_in_order,
                        "yaml_config": config["yaml_config"],
                        "run_id": run_id,
                    },
                }
            )
            _update_run_record(status="completed", ended_at=_now_ts(), cost=cost)
            _audit_run("run.complete", True, detail={"cost": cost})
        else:
            await websocket.send_json(
                {
                    "type": "result",
                    "data": {
                        "message": "Pipeline executed successfully",
                        "cost": result,
                        "yaml_config": config["yaml_config"],
                        "run_id": run_id,
                    },
                }
            )
            _update_run_record(status="completed", ended_at=_now_ts(), cost=result)
            _audit_run("run.complete", True, detail={"cost": result})
        _record_run_status(config, "completed")
    except WebSocketDisconnect:
        if runner is not None:
            runner.is_cancelled = True
        if pipeline_task is not None and not pipeline_task.done():
            pipeline_task.cancel()
            try:
                await pipeline_task
            except asyncio.CancelledError:
                pass
        _update_run_record(status="cancelled", ended_at=_now_ts(), error="client_disconnected")
        _audit_run("run.cancel", True, detail={"reason": "client_disconnected"})
        _record_run_status(config, "cancelled")
        print("Client disconnected")
    except asyncio.CancelledError:
        _update_run_record(status="cancelled", ended_at=_now_ts(), error="cancelled")
        _audit_run("run.cancel", True, detail={"reason": "cancelled"})
        _record_run_status(config, "cancelled")
        raise
    except Exception as e:
        import traceback

        error_traceback = traceback.format_exc()
        print(f"Error occurred:\n{error_traceback}")
        if runner is not None and runner.is_cancelled:
            _update_run_record(status="cancelled", ended_at=_now_ts(), error=str(e))
            _audit_run("run.cancel", True, detail={"reason": str(e)})
            _record_run_status(config, "cancelled")
        else:
            _update_run_record(status="failed", ended_at=_now_ts(), error=str(e))
            _audit_run("run.fail", False, detail={"error": str(e)})
            _record_run_status(config, "failed")
        await websocket.send_json({"type": "error", "data": str(e), "traceback": error_traceback})
    finally:
        if run_id:
            unregister_run(run_id)
        if runner is not None:
            runner.reset_env()
        await websocket.close()
