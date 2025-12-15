from fastapi import APIRouter, HTTPException

from server.app.models import (
    PipelineCreateRequest,
    PipelineDuplicateRequest,
    PipelineMetadata,
    PipelineRecord,
    PipelineUpdateRequest,
)
from server.app.storage.pipeline_store import (
    create_pipeline,
    delete_pipeline,
    duplicate_pipeline,
    list_pipelines,
    load_pipeline,
    update_pipeline,
)

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineMetadata])
def list_all_pipelines(namespace: str) -> list[PipelineMetadata]:
    """List all pipelines for a namespace."""
    if not namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")

    pipelines = list_pipelines(namespace)
    return [
        PipelineMetadata.model_validate(pipeline.model_dump())
        for pipeline in pipelines
    ]


@router.post("", response_model=PipelineRecord, status_code=201)
def create_new_pipeline(request: PipelineCreateRequest) -> PipelineRecord:
    """Create a new pipeline with an optional initial state."""
    if not request.namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")
    if not request.name:
        raise HTTPException(status_code=400, detail="Pipeline name is required")

    return create_pipeline(
        request.namespace,
        request.name,
        state=request.state,
        description=request.description,
    )


@router.get("/{pipeline_id}", response_model=PipelineRecord)
def get_pipeline(pipeline_id: str, namespace: str) -> PipelineRecord:
    """Fetch a pipeline including its persisted state."""
    if not namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")
    return load_pipeline(namespace, pipeline_id)


@router.put("/{pipeline_id}", response_model=PipelineRecord)
def replace_pipeline(
    pipeline_id: str, request: PipelineUpdateRequest
) -> PipelineRecord:
    """Replace the pipeline contents."""
    if not request.namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")

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
    pipeline_id: str, request: PipelineUpdateRequest
) -> PipelineRecord:
    """Partially update a pipeline (e.g., rename or update metadata/state)."""
    if not request.namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")

    return update_pipeline(
        request.namespace,
        pipeline_id,
        name=request.name,
        state=request.state,
        description=request.description,
        expected_updated_at=request.expected_updated_at,
    )


@router.delete("/{pipeline_id}", status_code=204)
def remove_pipeline(pipeline_id: str, namespace: str) -> None:
    """Delete a pipeline."""
    if not namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")
    delete_pipeline(namespace, pipeline_id)


@router.post("/{pipeline_id}/duplicate", response_model=PipelineRecord, status_code=201)
def duplicate_existing_pipeline(
    pipeline_id: str, request: PipelineDuplicateRequest
) -> PipelineRecord:
    """Duplicate a pipeline, optionally providing a new name."""
    if not request.namespace:
        raise HTTPException(status_code=400, detail="Namespace is required")

    return duplicate_pipeline(
        request.namespace, pipeline_id, name=request.name
    )
