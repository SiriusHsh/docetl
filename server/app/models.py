from pydantic import BaseModel
from typing import Any
from datetime import datetime
from enum import Enum


class PipelineRequest(BaseModel):
    yaml_config: str
    pipeline_id: str | None = None
    namespace: str | None = None
    save_output_to_data_center: bool | None = None

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

class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
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


class RunRecord(BaseModel):
    id: str
    namespace: str
    pipeline_id: str | None = None
    pipeline_name: str | None = None
    trigger: str
    deployment_id: str | None = None
    status: RunStatus
    created_at: int
    started_at: int | None = None
    ended_at: int | None = None
    cost: float | None = None
    output_path: str | None = None
    log_path: str | None = None
    error: str | None = None
    metadata: dict[str, Any] | None = None
    scheduled_for: int | None = None
    attempt: int = 1
    max_attempts: int | None = None
    triggered_by_user_id: str | None = None


class RunSummary(BaseModel):
    total: int
    running: int
    failed: int
    completed: int
    cancelled: int
    last_run_at: int | None = None


class DatasetSource(str, Enum):
    USER_UPLOAD = "user_upload"
    PIPELINE_GENERATED = "pipeline_generated"


class DatasetFormat(str, Enum):
    JSON = "json"


class DatasetIngestStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class DatasetRecord(BaseModel):
    id: str
    namespace: str
    name: str
    source: DatasetSource
    format: DatasetFormat
    original_format: str | None = None
    raw_path: str | None = None
    path: str
    ingest_status: DatasetIngestStatus
    ingest_config: dict[str, Any] | None = None
    created_at: int
    updated_at: int
    schema: dict[str, Any] | None = None
    row_count: int | None = None
    lineage: dict[str, Any] | None = None
    tags: list[str] | None = None
    description: str | None = None
    error: str | None = None


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


# Auth/RBAC models
class PlatformRole(str, Enum):
    PLATFORM_ADMIN = "platform_admin"
    USER = "user"


class NamespaceRole(str, Enum):
    NAMESPACE_ADMIN = "namespace_admin"
    EDITOR = "editor"
    VIEWER = "viewer"


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class UserPublic(BaseModel):
    id: str
    username: str
    email: str | None = None
    is_active: bool
    platform_role: PlatformRole
    created_at: int
    updated_at: int
    last_login_at: int | None = None


class MembershipRecord(BaseModel):
    namespace: str
    role: NamespaceRole
    created_at: int
    updated_at: int


class AuthResponse(BaseModel):
    user: UserPublic
    token: str
    expires_at: int


class MeResponse(BaseModel):
    user: UserPublic
    memberships: list[MembershipRecord]


class UserCreateRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    platform_role: PlatformRole = PlatformRole.USER


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    platform_role: PlatformRole | None = None


class ResetPasswordRequest(BaseModel):
    password: str


class SetMembershipRequest(BaseModel):
    role: NamespaceRole


class AuditLogEntry(BaseModel):
    id: str
    occurred_at: int
    actor_user_id: str | None = None
    actor_username: str | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    namespace: str | None = None
    success: bool
    ip: str | None = None
    user_agent: str | None = None
    request_id: str | None = None
    detail: dict[str, Any] | None = None
