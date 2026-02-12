import uuid

from fastapi import APIRouter, Depends, HTTPException

from server.app.deps import get_db
from server.app.models import (
    NamespaceRole,
    PipelineCreateRequest,
    PipelineDuplicateRequest,
    PipelineMetadata,
    PipelineRecord,
    PipelineUpdateRequest,
)
from server.app.security import (
    CurrentUser,
    assert_namespace_role,
    get_current_user,
    require_namespace_role,
    resolve_namespace_for_read,
)
from server.app.storage import metadata_db
from server.app.storage.pipeline_store import (
    create_pipeline,
    delete_pipeline,
    duplicate_pipeline,
    list_pipelines,
    load_pipeline,
    update_pipeline,
)

router = APIRouter(prefix="/pipelines", tags=["pipelines"])

def _validate_pipeline_id(pipeline_id: str) -> None:
    try:
        uuid.UUID(pipeline_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid pipeline id") from exc


@router.get("", response_model=list[PipelineMetadata])
def list_all_pipelines(
    namespace: str,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> list[PipelineMetadata]:
    """List all pipelines for a namespace."""
    namespace_value = resolve_namespace_for_read(
        conn=conn,
        current_user=current_user,
        namespace=namespace,
        min_role=NamespaceRole.VIEWER,
    )
    if namespace_value is None:
        pipelines = []
        for namespace_item in metadata_db.list_namespace_values(conn, include_inactive=True):
            pipelines.extend(list_pipelines(namespace_item))
        pipelines.sort(key=lambda record: record.updated_at, reverse=True)
    else:
        pipelines = list_pipelines(namespace_value)
    return [
        PipelineMetadata.model_validate(pipeline.model_dump())
        for pipeline in pipelines
    ]


@router.post("", response_model=PipelineRecord, status_code=201)
def create_new_pipeline(
    request: PipelineCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> PipelineRecord:
    """Create a new pipeline with an optional initial state."""
    if not request.name:
        raise HTTPException(status_code=400, detail="Pipeline name is required")

    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=request.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    return create_pipeline(
        request.namespace,
        request.name,
        state=request.state,
        description=request.description,
    )


@router.get("/{pipeline_id}", response_model=PipelineRecord)
def get_pipeline(
    pipeline_id: str,
    namespace: str,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.VIEWER)
    ),
) -> PipelineRecord:
    """Fetch a pipeline including its persisted state."""
    _validate_pipeline_id(pipeline_id)
    _, namespace_value, _ = ctx
    return load_pipeline(namespace_value, pipeline_id)


@router.put("/{pipeline_id}", response_model=PipelineRecord)
def replace_pipeline(
    pipeline_id: str,
    request: PipelineUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> PipelineRecord:
    """Replace the pipeline contents."""
    _validate_pipeline_id(pipeline_id)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=request.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    return update_pipeline(
        request.namespace,
        pipeline_id,
        name=request.name,
        state=request.state,
        description=request.description,
        expected_updated_at=request.expected_updated_at,
    )


@router.patch("/{pipeline_id}", response_model=PipelineRecord)
def patch_pipeline(
    pipeline_id: str,
    request: PipelineUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> PipelineRecord:
    """Partially update a pipeline (e.g., rename or update metadata/state)."""
    _validate_pipeline_id(pipeline_id)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=request.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    return update_pipeline(
        request.namespace,
        pipeline_id,
        name=request.name,
        state=request.state,
        description=request.description,
        expected_updated_at=request.expected_updated_at,
    )


@router.delete("/{pipeline_id}", status_code=204)
def remove_pipeline(
    pipeline_id: str,
    namespace: str,
    ctx: tuple[CurrentUser, str, NamespaceRole] = Depends(
        require_namespace_role(min_role=NamespaceRole.EDITOR)
    ),
) -> None:
    """Delete a pipeline."""
    _validate_pipeline_id(pipeline_id)
    _, namespace_value, _ = ctx
    delete_pipeline(namespace_value, pipeline_id)


@router.post("/{pipeline_id}/duplicate", response_model=PipelineRecord, status_code=201)
def duplicate_existing_pipeline(
    pipeline_id: str,
    request: PipelineDuplicateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
) -> PipelineRecord:
    """Duplicate a pipeline, optionally providing a new name."""
    _validate_pipeline_id(pipeline_id)
    assert_namespace_role(
        conn=conn,
        current_user=current_user,
        namespace=request.namespace,
        min_role=NamespaceRole.EDITOR,
    )

    return duplicate_pipeline(
        request.namespace, pipeline_id, name=request.name
    )
