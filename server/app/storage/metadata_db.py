from __future__ import annotations

import hmac
import json
import os
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Literal

from server.app.storage.paths import get_platform_db_path, get_platform_dir


PlatformRole = Literal["platform_admin", "user"]
NamespaceRole = Literal["namespace_admin", "editor", "viewer"]
_UNSET: Any = object()


def utc_now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _utc_ts_from_timedelta(delta: timedelta) -> int:
    return int((datetime.now(timezone.utc) + delta).timestamp())


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(
        str(db_path),
        timeout=30,
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    resolved_path = db_path or get_platform_db_path()
    resolved_path.parent.mkdir(parents=True, exist_ok=True)
    return _connect(resolved_path)


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT,
          password_hash TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          platform_role TEXT NOT NULL DEFAULT 'user',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_login_at INTEGER
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS memberships (
          user_id TEXT NOT NULL,
          namespace TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, namespace),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          revoked_at INTEGER,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          occurred_at INTEGER NOT NULL,
          actor_user_id TEXT,
          actor_username TEXT,
          action TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          namespace TEXT,
          success INTEGER NOT NULL,
          ip TEXT,
          user_agent TEXT,
          request_id TEXT,
          detail_json TEXT,
          FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_namespace ON audit_logs(namespace);

        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL,
          pipeline_id TEXT,
          pipeline_name TEXT,
          trigger TEXT NOT NULL,
          deployment_id TEXT,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          ended_at INTEGER,
          cost REAL,
          output_path TEXT,
          log_path TEXT,
          error TEXT,
          metadata_json TEXT,
          scheduled_for INTEGER,
          attempt INTEGER NOT NULL DEFAULT 1,
          max_attempts INTEGER,
          triggered_by_user_id TEXT,
          FOREIGN KEY(triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_runs_namespace ON runs(namespace);
        CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
        CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
        CREATE INDEX IF NOT EXISTS idx_runs_pipeline_id ON runs(pipeline_id);

        CREATE TABLE IF NOT EXISTS datasets (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          format TEXT NOT NULL,
          original_format TEXT,
          raw_path TEXT,
          path TEXT NOT NULL,
          ingest_status TEXT NOT NULL,
          ingest_config_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          schema_json TEXT,
          row_count INTEGER,
          lineage_json TEXT,
          tags_json TEXT,
          description TEXT,
          error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_datasets_namespace ON datasets(namespace);
        CREATE INDEX IF NOT EXISTS idx_datasets_source ON datasets(source);
        CREATE INDEX IF NOT EXISTS idx_datasets_name ON datasets(name);
        """
    )


_AUTH_SECRET: bytes | None = None


def _get_auth_secret() -> bytes:
    global _AUTH_SECRET
    if _AUTH_SECRET is not None:
        return _AUTH_SECRET

    secret = os.getenv("DOCETL_AUTH_SECRET")
    if secret:
        _AUTH_SECRET = secret.encode("utf-8")
    else:
        secret_path = get_platform_dir() / "auth_secret"
        try:
            if secret_path.exists():
                stored = secret_path.read_text(encoding="utf-8").strip()
                if stored:
                    _AUTH_SECRET = stored.encode("utf-8")
                    return _AUTH_SECRET
        except OSError:
            pass

        secret_bytes = secrets.token_bytes(32)
        secret_value = secret_bytes.hex()
        try:
            secret_path.parent.mkdir(parents=True, exist_ok=True)
            secret_path.write_text(secret_value, encoding="utf-8")
            try:
                os.chmod(secret_path, 0o600)
            except OSError:
                pass
        except OSError:
            _AUTH_SECRET = secret_bytes
            return _AUTH_SECRET

        _AUTH_SECRET = secret_value.encode("utf-8")
    return _AUTH_SECRET


def hash_session_token(token: str) -> str:
    return hmac.new(_get_auth_secret(), token.encode("utf-8"), "sha256").hexdigest()


def hash_password(password: str, *, iterations: int = 200_000) -> str:
    salt = secrets.token_bytes(16)
    import hashlib

    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "pbkdf2_sha256$%d$%s$%s" % (
        iterations,
        salt.hex(),
        dk.hex(),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations_str, salt_hex, dk_hex = stored_hash.split("$", 3)
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iterations_str)
    except ValueError:
        return False

    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(dk_hex)
    import hashlib

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return secrets.compare_digest(actual, expected)


@dataclass(frozen=True)
class UserRow:
    id: str
    username: str
    email: str | None
    is_active: bool
    platform_role: PlatformRole
    created_at: int
    updated_at: int
    last_login_at: int | None


@dataclass(frozen=True)
class RunRow:
    id: str
    namespace: str
    pipeline_id: str | None
    pipeline_name: str | None
    trigger: str
    deployment_id: str | None
    status: str
    created_at: int
    started_at: int | None
    ended_at: int | None
    cost: float | None
    output_path: str | None
    log_path: str | None
    error: str | None
    metadata: dict[str, Any] | None
    scheduled_for: int | None
    attempt: int
    max_attempts: int | None
    triggered_by_user_id: str | None


@dataclass(frozen=True)
class DatasetRow:
    id: str
    namespace: str
    name: str
    source: str
    format: str
    original_format: str | None
    raw_path: str | None
    path: str
    ingest_status: str
    ingest_config: dict[str, Any] | None
    created_at: int
    updated_at: int
    schema: dict[str, Any] | None
    row_count: int | None
    lineage: dict[str, Any] | None
    tags: list[str] | None
    description: str | None
    error: str | None


def _row_to_user(row: sqlite3.Row) -> UserRow:
    return UserRow(
        id=str(row["id"]),
        username=str(row["username"]),
        email=str(row["email"]) if row["email"] is not None else None,
        is_active=bool(row["is_active"]),
        platform_role=str(row["platform_role"]),  # type: ignore[return-value]
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
        last_login_at=int(row["last_login_at"]) if row["last_login_at"] is not None else None,
    )


def _row_to_run(row: sqlite3.Row) -> RunRow:
    return RunRow(
        id=str(row["id"]),
        namespace=str(row["namespace"]),
        pipeline_id=str(row["pipeline_id"]) if row["pipeline_id"] is not None else None,
        pipeline_name=str(row["pipeline_name"]) if row["pipeline_name"] is not None else None,
        trigger=str(row["trigger"]),
        deployment_id=str(row["deployment_id"]) if row["deployment_id"] is not None else None,
        status=str(row["status"]),
        created_at=int(row["created_at"]),
        started_at=int(row["started_at"]) if row["started_at"] is not None else None,
        ended_at=int(row["ended_at"]) if row["ended_at"] is not None else None,
        cost=float(row["cost"]) if row["cost"] is not None else None,
        output_path=str(row["output_path"]) if row["output_path"] is not None else None,
        log_path=str(row["log_path"]) if row["log_path"] is not None else None,
        error=str(row["error"]) if row["error"] is not None else None,
        metadata=json.loads(row["metadata_json"]) if row["metadata_json"] else None,
        scheduled_for=int(row["scheduled_for"]) if row["scheduled_for"] is not None else None,
        attempt=int(row["attempt"]) if row["attempt"] is not None else 1,
        max_attempts=int(row["max_attempts"]) if row["max_attempts"] is not None else None,
        triggered_by_user_id=str(row["triggered_by_user_id"]) if row["triggered_by_user_id"] is not None else None,
    )


def _row_to_dataset(row: sqlite3.Row) -> DatasetRow:
    return DatasetRow(
        id=str(row["id"]),
        namespace=str(row["namespace"]),
        name=str(row["name"]),
        source=str(row["source"]),
        format=str(row["format"]),
        original_format=str(row["original_format"]) if row["original_format"] is not None else None,
        raw_path=str(row["raw_path"]) if row["raw_path"] is not None else None,
        path=str(row["path"]),
        ingest_status=str(row["ingest_status"]),
        ingest_config=json.loads(row["ingest_config_json"]) if row["ingest_config_json"] else None,
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
        schema=json.loads(row["schema_json"]) if row["schema_json"] else None,
        row_count=int(row["row_count"]) if row["row_count"] is not None else None,
        lineage=json.loads(row["lineage_json"]) if row["lineage_json"] else None,
        tags=json.loads(row["tags_json"]) if row["tags_json"] else None,
        description=str(row["description"]) if row["description"] is not None else None,
        error=str(row["error"]) if row["error"] is not None else None,
    )


_RUN_COLUMNS = (
    "id, namespace, pipeline_id, pipeline_name, trigger, deployment_id, status, "
    "created_at, started_at, ended_at, cost, output_path, log_path, error, "
    "metadata_json, scheduled_for, attempt, max_attempts, triggered_by_user_id"
)

_DATASET_COLUMNS = (
    "id, namespace, name, source, format, original_format, raw_path, path, "
    "ingest_status, ingest_config_json, created_at, updated_at, schema_json, "
    "row_count, lineage_json, tags_json, description, error"
)


def create_user(
    conn: sqlite3.Connection,
    *,
    username: str,
    password: str,
    email: str | None = None,
    platform_role: PlatformRole = "user",
) -> UserRow:
    now = utc_now_ts()
    user_id = str(uuid.uuid4())
    password_hash = hash_password(password)
    try:
        conn.execute(
            """
            INSERT INTO users (id, username, email, password_hash, is_active, platform_role, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (user_id, username, email, password_hash, platform_role, now, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("username_or_email_exists") from exc
    row = conn.execute(
        "SELECT id, username, email, is_active, platform_role, created_at, updated_at, last_login_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load created user")
    return _row_to_user(row)


def get_user_by_username(conn: sqlite3.Connection, username: str) -> tuple[UserRow, str] | None:
    row = conn.execute(
        """
        SELECT id, username, email, password_hash, is_active, platform_role, created_at, updated_at, last_login_at
        FROM users
        WHERE username = ?
        """,
        (username,),
    ).fetchone()
    if row is None:
        return None
    user = UserRow(
        id=str(row["id"]),
        username=str(row["username"]),
        email=str(row["email"]) if row["email"] is not None else None,
        is_active=bool(row["is_active"]),
        platform_role=str(row["platform_role"]),  # type: ignore[return-value]
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
        last_login_at=int(row["last_login_at"]) if row["last_login_at"] is not None else None,
    )
    return user, str(row["password_hash"])


def get_user_by_id(conn: sqlite3.Connection, user_id: str) -> UserRow | None:
    row = conn.execute(
        """
        SELECT id, username, email, is_active, platform_role, created_at, updated_at, last_login_at
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_user(row)


def list_users(conn: sqlite3.Connection, *, limit: int = 200, offset: int = 0) -> list[UserRow]:
    rows = conn.execute(
        """
        SELECT id, username, email, is_active, platform_role, created_at, updated_at, last_login_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()
    return [_row_to_user(row) for row in rows]


def set_user_active(conn: sqlite3.Connection, user_id: str, *, is_active: bool) -> UserRow:
    now = utc_now_ts()
    conn.execute(
        "UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?",
        (1 if is_active else 0, now, user_id),
    )
    row = conn.execute(
        "SELECT id, username, email, is_active, platform_role, created_at, updated_at, last_login_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise ValueError("user_not_found")
    return _row_to_user(row)


def set_user_password(conn: sqlite3.Connection, user_id: str, *, password: str) -> None:
    now = utc_now_ts()
    password_hash = hash_password(password)
    cur = conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        (password_hash, now, user_id),
    )
    if cur.rowcount == 0:
        raise ValueError("user_not_found")


def set_user_platform_role(conn: sqlite3.Connection, user_id: str, *, platform_role: PlatformRole) -> UserRow:
    now = utc_now_ts()
    conn.execute(
        "UPDATE users SET platform_role = ?, updated_at = ? WHERE id = ?",
        (platform_role, now, user_id),
    )
    row = conn.execute(
        "SELECT id, username, email, is_active, platform_role, created_at, updated_at, last_login_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise ValueError("user_not_found")
    return _row_to_user(row)


def touch_last_login(conn: sqlite3.Connection, user_id: str) -> None:
    now = utc_now_ts()
    conn.execute(
        "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
        (now, now, user_id),
    )


def upsert_membership(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    namespace: str,
    role: NamespaceRole,
) -> None:
    now = utc_now_ts()
    conn.execute(
        """
        INSERT INTO memberships (user_id, namespace, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, namespace) DO UPDATE SET role=excluded.role, updated_at=excluded.updated_at
        """,
        (user_id, namespace, role, now, now),
    )


def list_memberships(conn: sqlite3.Connection, *, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT namespace, role, created_at, updated_at
        FROM memberships
        WHERE user_id = ?
        ORDER BY namespace ASC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "namespace": str(row["namespace"]),
            "role": str(row["role"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }
        for row in rows
    ]


def get_namespace_role(conn: sqlite3.Connection, *, user_id: str, namespace: str) -> NamespaceRole | None:
    row = conn.execute(
        "SELECT role FROM memberships WHERE user_id = ? AND namespace = ?",
        (user_id, namespace),
    ).fetchone()
    if row is None:
        return None
    return str(row["role"])  # type: ignore[return-value]


def create_session(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    ttl: timedelta = timedelta(days=7),
) -> tuple[str, int]:
    session_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    token_hash = hash_session_token(token)
    created_at = utc_now_ts()
    expires_at = _utc_ts_from_timedelta(ttl)
    conn.execute(
        """
        INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, ?, NULL)
        """,
        (session_id, user_id, token_hash, created_at, expires_at),
    )
    return token, expires_at


def revoke_session(conn: sqlite3.Connection, *, token_hash: str) -> None:
    now = utc_now_ts()
    conn.execute(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
        (now, token_hash),
    )


def resolve_session_user(conn: sqlite3.Connection, *, token_hash: str) -> UserRow | None:
    now = utc_now_ts()
    row = conn.execute(
        """
        SELECT u.id, u.username, u.email, u.is_active, u.platform_role, u.created_at, u.updated_at, u.last_login_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
        """,
        (token_hash, now),
    ).fetchone()
    if row is None:
        return None
    return _row_to_user(row)


def insert_audit_log(
    conn: sqlite3.Connection,
    *,
    actor_user_id: str | None,
    actor_username: str | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    namespace: str | None = None,
    success: bool,
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> str:
    log_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO audit_logs (
          id, occurred_at, actor_user_id, actor_username, action,
          resource_type, resource_id, namespace, success, ip, user_agent, request_id, detail_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            log_id,
            utc_now_ts(),
            actor_user_id,
            actor_username,
            action,
            resource_type,
            resource_id,
            namespace,
            1 if success else 0,
            ip,
            user_agent,
            request_id,
            json.dumps(detail) if detail is not None else None,
        ),
    )
    return log_id


def list_audit_logs(
    conn: sqlite3.Connection,
    *,
    namespace: str | None = None,
    actor_user_id: str | None = None,
    action: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    where: list[str] = []
    params: list[Any] = []
    if namespace is not None:
        where.append("namespace = ?")
        params.append(namespace)
    if actor_user_id is not None:
        where.append("actor_user_id = ?")
        params.append(actor_user_id)
    if action is not None:
        where.append("action = ?")
        params.append(action)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = conn.execute(
        f"""
        SELECT id, occurred_at, actor_user_id, actor_username, action, resource_type, resource_id, namespace,
               success, ip, user_agent, request_id, detail_json
        FROM audit_logs
        {where_sql}
        ORDER BY occurred_at DESC
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    ).fetchall()
    results: list[dict[str, Any]] = []
    for row in rows:
        detail_json = row["detail_json"]
        results.append(
            {
                "id": str(row["id"]),
                "occurred_at": int(row["occurred_at"]),
                "actor_user_id": str(row["actor_user_id"]) if row["actor_user_id"] is not None else None,
                "actor_username": str(row["actor_username"]) if row["actor_username"] is not None else None,
                "action": str(row["action"]),
                "resource_type": str(row["resource_type"]) if row["resource_type"] is not None else None,
                "resource_id": str(row["resource_id"]) if row["resource_id"] is not None else None,
                "namespace": str(row["namespace"]) if row["namespace"] is not None else None,
                "success": bool(row["success"]),
                "ip": str(row["ip"]) if row["ip"] is not None else None,
                "user_agent": str(row["user_agent"]) if row["user_agent"] is not None else None,
                "request_id": str(row["request_id"]) if row["request_id"] is not None else None,
                "detail": json.loads(detail_json) if detail_json else None,
            }
        )
    return results


def ensure_bootstrap_admin(conn: sqlite3.Connection) -> None:
    username = os.getenv("DOCETL_BOOTSTRAP_ADMIN_USERNAME")
    password = os.getenv("DOCETL_BOOTSTRAP_ADMIN_PASSWORD")
    email = os.getenv("DOCETL_BOOTSTRAP_ADMIN_EMAIL")
    if not username or not password:
        return

    row = conn.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None:
        create_user(
            conn,
            username=username,
            password=password,
            email=email,
            platform_role="platform_admin",
        )
        return

    user_id = str(row["id"])
    set_user_platform_role(conn, user_id, platform_role="platform_admin")
    # Optionally reset password on boot for deterministic dev environment
    if os.getenv("DOCETL_BOOTSTRAP_ADMIN_RESET_PASSWORD", "false").lower() == "true":
        set_user_password(conn, user_id, password=password)


def create_run(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    trigger: str,
    status: str,
    pipeline_id: str | None = None,
    pipeline_name: str | None = None,
    deployment_id: str | None = None,
    started_at: int | None = None,
    cost: float | None = None,
    output_path: str | None = None,
    log_path: str | None = None,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
    scheduled_for: int | None = None,
    attempt: int = 1,
    max_attempts: int | None = None,
    triggered_by_user_id: str | None = None,
) -> RunRow:
    run_id = str(uuid.uuid4())
    now = utc_now_ts()
    if started_at is None and status in {"running", "completed", "failed", "cancelled"}:
        started_at = now
    conn.execute(
        f"""
        INSERT INTO runs (
          id, namespace, pipeline_id, pipeline_name, trigger, deployment_id, status,
          created_at, started_at, ended_at, cost, output_path, log_path, error,
          metadata_json, scheduled_for, attempt, max_attempts, triggered_by_user_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            namespace,
            pipeline_id,
            pipeline_name,
            trigger,
            deployment_id,
            status,
            now,
            started_at,
            cost,
            output_path,
            log_path,
            error,
            json.dumps(metadata) if metadata is not None else None,
            scheduled_for,
            attempt,
            max_attempts,
            triggered_by_user_id,
        ),
    )
    row = conn.execute(
        f"SELECT {_RUN_COLUMNS} FROM runs WHERE id = ?",
        (run_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load created run")
    return _row_to_run(row)


def update_run(
    conn: sqlite3.Connection,
    run_id: str,
    *,
    status: str | None | Any = _UNSET,
    started_at: int | None | Any = _UNSET,
    ended_at: int | None | Any = _UNSET,
    cost: float | None | Any = _UNSET,
    output_path: str | None | Any = _UNSET,
    log_path: str | None | Any = _UNSET,
    error: str | None | Any = _UNSET,
    metadata: dict[str, Any] | None | Any = _UNSET,
) -> RunRow:
    updates: list[str] = []
    params: list[Any] = []

    if status is not _UNSET:
        updates.append("status = ?")
        params.append(status)
    if started_at is not _UNSET:
        updates.append("started_at = ?")
        params.append(started_at)
    if ended_at is not _UNSET:
        updates.append("ended_at = ?")
        params.append(ended_at)
    if cost is not _UNSET:
        updates.append("cost = ?")
        params.append(cost)
    if output_path is not _UNSET:
        updates.append("output_path = ?")
        params.append(output_path)
    if log_path is not _UNSET:
        updates.append("log_path = ?")
        params.append(log_path)
    if error is not _UNSET:
        updates.append("error = ?")
        params.append(error)
    if metadata is not _UNSET:
        updates.append("metadata_json = ?")
        params.append(json.dumps(metadata) if metadata is not None else None)

    if updates:
        params.append(run_id)
        conn.execute(
            f"UPDATE runs SET {', '.join(updates)} WHERE id = ?",
            params,
        )

    row = conn.execute(
        f"SELECT {_RUN_COLUMNS} FROM runs WHERE id = ?",
        (run_id,),
    ).fetchone()
    if row is None:
        raise ValueError("run_not_found")
    return _row_to_run(row)


def get_run(conn: sqlite3.Connection, run_id: str) -> RunRow | None:
    row = conn.execute(
        f"SELECT {_RUN_COLUMNS} FROM runs WHERE id = ?",
        (run_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_run(row)


def list_runs(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    status: str | None = None,
    pipeline_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[RunRow]:
    where: list[str] = ["namespace = ?"]
    params: list[Any] = [namespace]
    if status is not None:
        where.append("status = ?")
        params.append(status)
    if pipeline_id is not None:
        where.append("pipeline_id = ?")
        params.append(pipeline_id)

    where_sql = " AND ".join(where)
    rows = conn.execute(
        f"""
        SELECT {_RUN_COLUMNS}
        FROM runs
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    ).fetchall()
    return [_row_to_run(row) for row in rows]


def get_run_summary(conn: sqlite3.Connection, *, namespace: str) -> dict[str, int | None]:
    row = conn.execute(
        """
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          MAX(created_at) AS last_run_at
        FROM runs
        WHERE namespace = ?
        """,
        (namespace,),
    ).fetchone()
    if row is None:
        return {
            "total": 0,
            "running": 0,
            "failed": 0,
            "completed": 0,
            "cancelled": 0,
            "last_run_at": None,
        }
    return {
        "total": int(row["total"] or 0),
        "running": int(row["running"] or 0),
        "failed": int(row["failed"] or 0),
        "completed": int(row["completed"] or 0),
        "cancelled": int(row["cancelled"] or 0),
        "last_run_at": int(row["last_run_at"]) if row["last_run_at"] is not None else None,
    }


def create_dataset(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    name: str,
    source: str,
    format: str,
    original_format: str | None,
    raw_path: str | None,
    path: str,
    ingest_status: str,
    ingest_config: dict[str, Any] | None = None,
    schema: dict[str, Any] | None = None,
    row_count: int | None = None,
    lineage: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    description: str | None = None,
    error: str | None = None,
    dataset_id: str | None = None,
) -> DatasetRow:
    dataset_id = dataset_id or str(uuid.uuid4())
    now = utc_now_ts()
    conn.execute(
        f"""
        INSERT INTO datasets (
          id, namespace, name, source, format, original_format, raw_path, path,
          ingest_status, ingest_config_json, created_at, updated_at, schema_json,
          row_count, lineage_json, tags_json, description, error
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            dataset_id,
            namespace,
            name,
            source,
            format,
            original_format,
            raw_path,
            path,
            ingest_status,
            json.dumps(ingest_config) if ingest_config is not None else None,
            now,
            now,
            json.dumps(schema) if schema is not None else None,
            row_count,
            json.dumps(lineage) if lineage is not None else None,
            json.dumps(tags) if tags is not None else None,
            description,
            error,
        ),
    )
    row = conn.execute(
        f"SELECT {_DATASET_COLUMNS} FROM datasets WHERE id = ?",
        (dataset_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load created dataset")
    return _row_to_dataset(row)


def update_dataset(
    conn: sqlite3.Connection,
    dataset_id: str,
    *,
    ingest_status: str | None | Any = _UNSET,
    ingest_config: dict[str, Any] | None | Any = _UNSET,
    schema: dict[str, Any] | None | Any = _UNSET,
    row_count: int | None | Any = _UNSET,
    lineage: dict[str, Any] | None | Any = _UNSET,
    tags: list[str] | None | Any = _UNSET,
    description: str | None | Any = _UNSET,
    error: str | None | Any = _UNSET,
) -> DatasetRow:
    updates: list[str] = ["updated_at = ?"]
    params: list[Any] = [utc_now_ts()]

    if ingest_status is not _UNSET:
        updates.append("ingest_status = ?")
        params.append(ingest_status)
    if ingest_config is not _UNSET:
        updates.append("ingest_config_json = ?")
        params.append(json.dumps(ingest_config) if ingest_config is not None else None)
    if schema is not _UNSET:
        updates.append("schema_json = ?")
        params.append(json.dumps(schema) if schema is not None else None)
    if row_count is not _UNSET:
        updates.append("row_count = ?")
        params.append(row_count)
    if lineage is not _UNSET:
        updates.append("lineage_json = ?")
        params.append(json.dumps(lineage) if lineage is not None else None)
    if tags is not _UNSET:
        updates.append("tags_json = ?")
        params.append(json.dumps(tags) if tags is not None else None)
    if description is not _UNSET:
        updates.append("description = ?")
        params.append(description)
    if error is not _UNSET:
        updates.append("error = ?")
        params.append(error)

    params.append(dataset_id)
    conn.execute(
        f"UPDATE datasets SET {', '.join(updates)} WHERE id = ?",
        params,
    )

    row = conn.execute(
        f"SELECT {_DATASET_COLUMNS} FROM datasets WHERE id = ?",
        (dataset_id,),
    ).fetchone()
    if row is None:
        raise ValueError("dataset_not_found")
    return _row_to_dataset(row)


def get_dataset(conn: sqlite3.Connection, dataset_id: str) -> DatasetRow | None:
    row = conn.execute(
        f"SELECT {_DATASET_COLUMNS} FROM datasets WHERE id = ?",
        (dataset_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_dataset(row)


def list_datasets(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    source: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[DatasetRow]:
    where: list[str] = ["namespace = ?"]
    params: list[Any] = [namespace]
    if source is not None:
        where.append("source = ?")
        params.append(source)

    where_sql = " AND ".join(where)
    rows = conn.execute(
        f"""
        SELECT {_DATASET_COLUMNS}
        FROM datasets
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    ).fetchall()
    return [_row_to_dataset(row) for row in rows]
