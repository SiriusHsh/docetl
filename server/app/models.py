from pydantic import BaseModel
from typing import Any
from datetime import datetime
from enum import Enum


class PipelineRequest(BaseModel):
    yaml_config: str
    pipeline_id: str | None = None
    namespace: str | None = None

class PipelineConfigRequest(BaseModel):
    namespace: str
    name: str
    config: str
    input_path: str
    output_path: str

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class OptimizeResult(BaseModel):
    task_id: str
    status: TaskStatus
    should_optimize: str | None = None
    input_data: list[dict[str, Any]] | None = None
    output_data: list[dict[str, Any]] | None = None
    cost: float | None = None
    error: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

class OptimizeRequest(BaseModel):
    yaml_config: str
    step_name: str
    op_name: str


# Pipeline persistence models
class PipelineMetadata(BaseModel):
    id: str
    name: str
    namespace: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    last_run_status: str | None = None
    last_run_at: datetime | None = None


class PipelineRecord(PipelineMetadata):
    state: dict[str, Any] = {}


class PipelineCreateRequest(BaseModel):
    namespace: str
    name: str
    state: dict[str, Any] = {}
    description: str | None = None


class PipelineUpdateRequest(BaseModel):
    namespace: str
    name: str | None = None
    state: dict[str, Any] | None = None
    description: str | None = None
    expected_updated_at: datetime | None = None


class PipelineDuplicateRequest(BaseModel):
    namespace: str
    name: str | None = None
