from __future__ import annotations

import hmac
import json
import os
import secrets
import shutil
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Literal

from server.app.storage import paths as storage_paths
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

        CREATE TABLE IF NOT EXISTS platform_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS namespace_catalog (
          namespace TEXT PRIMARY KEY,
          display_name TEXT NOT NULL UNIQUE,
          description TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by_user_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS memberships (
          user_id TEXT NOT NULL,
          namespace TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, namespace),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS group_memberships (
          group_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, user_id),
          FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_group_memberships_user_id ON group_memberships(user_id);
        CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON group_memberships(group_id);

        CREATE TABLE IF NOT EXISTS group_namespace_roles (
          group_id TEXT NOT NULL,
          namespace TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (group_id, namespace),
          FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_group_namespace_roles_namespace ON group_namespace_roles(namespace);

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

        CREATE TABLE IF NOT EXISTS deployments (
          id TEXT PRIMARY KEY,
          namespace TEXT NOT NULL,
          name TEXT NOT NULL,
          pipeline_id TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          schedule_type TEXT NOT NULL,
          schedule_json TEXT NOT NULL,
          timezone TEXT NOT NULL,
          input_dataset_id TEXT,
          output_to_data_center INTEGER NOT NULL DEFAULT 0,
          output_dataset_name_tpl TEXT,
          misfire_policy TEXT NOT NULL,
          max_catchup_runs INTEGER,
          retry_policy_json TEXT,
          concurrency_policy_json TEXT,
          last_run_id TEXT,
          next_run_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_namespace_name ON deployments(namespace, name);
        CREATE INDEX IF NOT EXISTS idx_deployments_namespace ON deployments(namespace);
        CREATE INDEX IF NOT EXISTS idx_deployments_pipeline_id ON deployments(pipeline_id);

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

        CREATE TABLE IF NOT EXISTS model_registry (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          model_id TEXT NOT NULL,
          protocol TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_key TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL,
          params_json TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_model_registry_status ON model_registry(status);
        CREATE INDEX IF NOT EXISTS idx_model_registry_updated_at ON model_registry(updated_at);
        """
    )
    _backfill_namespace_catalog(conn)
    _ensure_default_public_business_namespace(conn)
    _migrate_legacy_namespaces_to_public_business(conn)
    _normalize_membership_roles_to_editor(conn)


def _backfill_namespace_catalog(conn: sqlite3.Connection) -> None:
    now = utc_now_ts()
    conn.execute(
        """
        INSERT OR IGNORE INTO namespace_catalog (
          namespace, display_name, description, is_active, created_by_user_id, created_at, updated_at
        )
        SELECT src.namespace, src.namespace, NULL, 1, NULL, ?, ?
        FROM (
          SELECT DISTINCT namespace FROM memberships
          UNION
          SELECT DISTINCT namespace FROM runs
          UNION
          SELECT DISTINCT namespace FROM deployments
          UNION
          SELECT DISTINCT namespace FROM datasets
        ) AS src
        WHERE src.namespace IS NOT NULL AND TRIM(src.namespace) <> ''
        """,
        (now, now),
    )


def _ensure_default_public_business_namespace(conn: sqlite3.Connection) -> None:
    now = utc_now_ts()
    conn.execute(
        """
        INSERT OR IGNORE INTO namespace_catalog (
          namespace, display_name, description, is_active, created_by_user_id, created_at, updated_at
        )
        VALUES (?, ?, ?, 1, NULL, ?, ?)
        """,
        ("public_business", "公共业务", "默认公共业务场景", now, now),
    )


def _get_platform_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute(
        "SELECT value FROM platform_meta WHERE key = ?",
        (key,),
    ).fetchone()
    if row is None:
        return None
    return str(row["value"])


def _set_platform_meta(conn: sqlite3.Connection, *, key: str, value: str) -> None:
    now = utc_now_ts()
    conn.execute(
        """
        INSERT INTO platform_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        """,
        (key, value, now),
    )


def _rewrite_namespace_path(path_value: str | None, *, old_ns: str, new_ns: str) -> str | None:
    if not path_value:
        return path_value
    marker = os.path.join(".docetl", old_ns)
    if marker not in path_value:
        return path_value
    return path_value.replace(
        os.path.join(".docetl", old_ns),
        os.path.join(".docetl", new_ns),
    )


def _merge_namespace_files(*, old_ns: str, new_ns: str) -> None:
    old_root = storage_paths.get_namespace_dir(old_ns)
    new_root = storage_paths.get_namespace_dir(new_ns)
    if not old_root.exists():
        return
    new_root.mkdir(parents=True, exist_ok=True)

    for source in old_root.rglob("*"):
        relative = source.relative_to(old_root)
        target = new_root / relative
        if source.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            continue
        try:
            shutil.copy2(source, target)
        except OSError:
            continue


def _normalize_pipeline_store_namespace(*, public_ns: str, legacy_namespaces: set[str]) -> None:
    if not legacy_namespaces:
        return

    def _normalize_value(value: Any) -> tuple[Any, bool]:
        if isinstance(value, dict):
            changed = False
            normalized: dict[str, Any] = {}
            for key, item in value.items():
                if key == "namespace" and isinstance(item, str) and item in legacy_namespaces:
                    normalized[key] = public_ns
                    changed = True
                    continue
                normalized_item, item_changed = _normalize_value(item)
                normalized[key] = normalized_item
                changed = changed or item_changed
            return normalized, changed
        if isinstance(value, list):
            changed = False
            normalized_list: list[Any] = []
            for item in value:
                normalized_item, item_changed = _normalize_value(item)
                normalized_list.append(normalized_item)
                changed = changed or item_changed
            return normalized_list, changed
        if isinstance(value, str):
            rewritten = value
            for legacy_ns in legacy_namespaces:
                rewritten = _rewrite_namespace_path(
                    rewritten,
                    old_ns=legacy_ns,
                    new_ns=public_ns,
                ) or rewritten
            return rewritten, rewritten != value
        return value, False

    store_dir = storage_paths.get_namespace_dir(public_ns) / "pipelines" / "store"
    if not store_dir.exists():
        return
    for file_path in store_dir.glob("*.json"):
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        normalized_payload, changed = _normalize_value(payload)
        if not changed:
            continue
        try:
            file_path.write_text(
                json.dumps(normalized_payload, ensure_ascii=True, indent=2),
                encoding="utf-8",
            )
        except OSError:
            continue


def _role_rank(value: str) -> int:
    ranks = {"viewer": 0, "editor": 1, "namespace_admin": 2}
    return ranks.get(value, -1)


def _migrate_legacy_namespaces_to_public_business(conn: sqlite3.Connection) -> None:
    migration_key = "migration_legacy_to_public_business_v2"
    if _get_platform_meta(conn, migration_key) == "done":
        return

    public_ns = "public_business"
    _ensure_default_public_business_namespace(conn)

    legacy_rows = conn.execute(
        """
        SELECT nc.namespace
        FROM namespace_catalog nc
        WHERE nc.namespace <> ?
          AND (
            nc.created_by_user_id IS NULL
            OR EXISTS (
              SELECT 1 FROM users u WHERE u.username = nc.namespace
            )
          )
        ORDER BY nc.namespace ASC
        """,
        (public_ns,),
    ).fetchall()
    legacy_namespaces = [str(row["namespace"]) for row in legacy_rows]
    if not legacy_namespaces:
        _set_platform_meta(conn, key=migration_key, value="done")
        return

    # Merge filesystem artifacts first so rewritten paths are resolvable.
    for legacy_ns in legacy_namespaces:
        _merge_namespace_files(old_ns=legacy_ns, new_ns=public_ns)
    _normalize_pipeline_store_namespace(
        public_ns=public_ns,
        legacy_namespaces=set(legacy_namespaces),
    )

    # Consolidate user memberships into the default public namespace.
    rows = conn.execute(
        """
        SELECT user_id, role
        FROM memberships
        WHERE namespace = ? OR namespace IN (%s)
        """
        % ",".join("?" for _ in legacy_namespaces),
        (public_ns, *legacy_namespaces),
    ).fetchall()
    best_user_role: dict[str, str] = {}
    for row in rows:
        user_id = str(row["user_id"])
        role = str(row["role"])
        existing = best_user_role.get(user_id)
        if existing is None or _role_rank(role) > _role_rank(existing):
            best_user_role[user_id] = role
    for user_id in best_user_role:
        upsert_membership(
            conn,
            user_id=user_id,
            namespace=public_ns,
        )
    conn.execute(
        "DELETE FROM memberships WHERE namespace IN (%s)"
        % ",".join("?" for _ in legacy_namespaces),
        tuple(legacy_namespaces),
    )

    # Avoid unique(namespace, name) collisions for deployments before namespace rewrite.
    for legacy_ns in legacy_namespaces:
        deployment_rows = conn.execute(
            """
            SELECT id, name
            FROM deployments
            WHERE namespace = ?
            ORDER BY created_at ASC
            """,
            (legacy_ns,),
        ).fetchall()
        for row in deployment_rows:
            deployment_id = str(row["id"])
            name = str(row["name"])
            candidate = name
            suffix = 2
            while conn.execute(
                "SELECT 1 FROM deployments WHERE namespace = ? AND name = ? LIMIT 1",
                (public_ns, candidate),
            ).fetchone() is not None:
                candidate = f"{name}-{legacy_ns}-{suffix}"
                suffix += 1
            if candidate != name:
                conn.execute(
                    "UPDATE deployments SET name = ?, updated_at = ? WHERE id = ?",
                    (candidate, utc_now_ts(), deployment_id),
                )

    # Rewrite namespace columns for historical data.
    for legacy_ns in legacy_namespaces:
        conn.execute("UPDATE runs SET namespace = ? WHERE namespace = ?", (public_ns, legacy_ns))
        conn.execute("UPDATE deployments SET namespace = ? WHERE namespace = ?", (public_ns, legacy_ns))
        conn.execute("UPDATE datasets SET namespace = ? WHERE namespace = ?", (public_ns, legacy_ns))
        conn.execute("UPDATE audit_logs SET namespace = ? WHERE namespace = ?", (public_ns, legacy_ns))

    # Rewrite path fields that embed namespace segments.
    run_rows = conn.execute(
        "SELECT id, output_path, log_path FROM runs WHERE namespace = ?",
        (public_ns,),
    ).fetchall()
    for row in run_rows:
        run_id = str(row["id"])
        output_path = str(row["output_path"]) if row["output_path"] is not None else None
        log_path = str(row["log_path"]) if row["log_path"] is not None else None
        new_output = output_path
        new_log = log_path
        for legacy_ns in legacy_namespaces:
            new_output = _rewrite_namespace_path(new_output, old_ns=legacy_ns, new_ns=public_ns)
            new_log = _rewrite_namespace_path(new_log, old_ns=legacy_ns, new_ns=public_ns)
        if new_output != output_path or new_log != log_path:
            conn.execute(
                "UPDATE runs SET output_path = ?, log_path = ? WHERE id = ?",
                (new_output, new_log, run_id),
            )

    dataset_rows = conn.execute(
        "SELECT id, path, raw_path FROM datasets WHERE namespace = ?",
        (public_ns,),
    ).fetchall()
    for row in dataset_rows:
        dataset_id = str(row["id"])
        path = str(row["path"])
        raw_path = str(row["raw_path"]) if row["raw_path"] is not None else None
        new_path = path
        new_raw_path = raw_path
        for legacy_ns in legacy_namespaces:
            new_path = _rewrite_namespace_path(new_path, old_ns=legacy_ns, new_ns=public_ns) or new_path
            new_raw_path = _rewrite_namespace_path(
                new_raw_path, old_ns=legacy_ns, new_ns=public_ns
            )
        if new_path != path or new_raw_path != raw_path:
            conn.execute(
                "UPDATE datasets SET path = ?, raw_path = ? WHERE id = ?",
                (new_path, new_raw_path, dataset_id),
            )

    # Remove legacy scenario catalogs.
    conn.execute(
        "DELETE FROM namespace_catalog WHERE namespace IN (%s)"
        % ",".join("?" for _ in legacy_namespaces),
        tuple(legacy_namespaces),
    )
    _set_platform_meta(conn, key=migration_key, value="done")


def _normalize_membership_roles_to_editor(conn: sqlite3.Connection) -> None:
    conn.execute(
        "UPDATE memberships SET role = 'editor' WHERE role IS NOT NULL AND role <> 'editor'"
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
class GroupRow:
    id: str
    name: str
    description: str | None
    created_at: int
    updated_at: int


@dataclass(frozen=True)
class GroupMemberRow:
    group_id: str
    user_id: str
    username: str
    email: str | None
    is_active: bool
    platform_role: PlatformRole
    joined_at: int


@dataclass(frozen=True)
class GroupNamespaceAccessRow:
    group_id: str
    namespace: str
    role: NamespaceRole
    created_at: int
    updated_at: int


@dataclass(frozen=True)
class NamespaceCatalogRow:
    namespace: str
    display_name: str
    description: str | None
    is_active: bool
    created_by_user_id: str | None
    created_at: int
    updated_at: int


@dataclass(frozen=True)
class ModelRegistryRow:
    id: str
    name: str
    model_id: str
    protocol: str
    base_url: str
    api_key: str
    tags: list[str]
    description: str
    status: str
    params: dict[str, Any] | None
    created_at: int
    updated_at: int


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
class DeploymentRow:
    id: str
    namespace: str
    name: str
    pipeline_id: str
    enabled: bool
    schedule_type: str
    schedule: dict[str, Any]
    timezone: str
    input_dataset_id: str | None
    output_to_data_center: bool
    output_dataset_name_tpl: str | None
    misfire_policy: str
    max_catchup_runs: int | None
    retry_policy: dict[str, Any] | None
    concurrency_policy: dict[str, Any] | None
    last_run_id: str | None
    next_run_at: int | None
    created_at: int
    updated_at: int


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


def _row_to_group(row: sqlite3.Row) -> GroupRow:
    return GroupRow(
        id=str(row["id"]),
        name=str(row["name"]),
        description=str(row["description"]) if row["description"] is not None else None,
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
    )


def _row_to_group_member(row: sqlite3.Row) -> GroupMemberRow:
    return GroupMemberRow(
        group_id=str(row["group_id"]),
        user_id=str(row["user_id"]),
        username=str(row["username"]),
        email=str(row["email"]) if row["email"] is not None else None,
        is_active=bool(row["is_active"]),
        platform_role=str(row["platform_role"]),  # type: ignore[return-value]
        joined_at=int(row["joined_at"]),
    )


def _row_to_group_namespace_access(row: sqlite3.Row) -> GroupNamespaceAccessRow:
    return GroupNamespaceAccessRow(
        group_id=str(row["group_id"]),
        namespace=str(row["namespace"]),
        role=str(row["role"]),  # type: ignore[return-value]
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
    )


def _row_to_namespace_catalog(row: sqlite3.Row) -> NamespaceCatalogRow:
    return NamespaceCatalogRow(
        namespace=str(row["namespace"]),
        display_name=str(row["display_name"]),
        description=str(row["description"]) if row["description"] is not None else None,
        is_active=bool(row["is_active"]),
        created_by_user_id=(
            str(row["created_by_user_id"])
            if row["created_by_user_id"] is not None
            else None
        ),
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
    )


def _row_to_model_registry(row: sqlite3.Row) -> ModelRegistryRow:
    return ModelRegistryRow(
        id=str(row["id"]),
        name=str(row["name"]),
        model_id=str(row["model_id"]),
        protocol=str(row["protocol"]),
        base_url=str(row["base_url"]),
        api_key=str(row["api_key"]),
        tags=json.loads(row["tags_json"]) if row["tags_json"] else [],
        description=str(row["description"]),
        status=str(row["status"]),
        params=json.loads(row["params_json"]) if row["params_json"] else None,
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
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


def _row_to_deployment(row: sqlite3.Row) -> DeploymentRow:
    return DeploymentRow(
        id=str(row["id"]),
        namespace=str(row["namespace"]),
        name=str(row["name"]),
        pipeline_id=str(row["pipeline_id"]),
        enabled=bool(row["enabled"]),
        schedule_type=str(row["schedule_type"]),
        schedule=json.loads(row["schedule_json"]) if row["schedule_json"] else {},
        timezone=str(row["timezone"]),
        input_dataset_id=str(row["input_dataset_id"]) if row["input_dataset_id"] is not None else None,
        output_to_data_center=bool(row["output_to_data_center"]),
        output_dataset_name_tpl=str(row["output_dataset_name_tpl"]) if row["output_dataset_name_tpl"] is not None else None,
        misfire_policy=str(row["misfire_policy"]),
        max_catchup_runs=int(row["max_catchup_runs"]) if row["max_catchup_runs"] is not None else None,
        retry_policy=json.loads(row["retry_policy_json"]) if row["retry_policy_json"] else None,
        concurrency_policy=json.loads(row["concurrency_policy_json"]) if row["concurrency_policy_json"] else None,
        last_run_id=str(row["last_run_id"]) if row["last_run_id"] is not None else None,
        next_run_at=int(row["next_run_at"]) if row["next_run_at"] is not None else None,
        created_at=int(row["created_at"]),
        updated_at=int(row["updated_at"]),
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

_DEPLOYMENT_COLUMNS = (
    "id, namespace, name, pipeline_id, enabled, schedule_type, schedule_json, "
    "timezone, input_dataset_id, output_to_data_center, output_dataset_name_tpl, "
    "misfire_policy, max_catchup_runs, retry_policy_json, concurrency_policy_json, "
    "last_run_id, next_run_at, created_at, updated_at"
)

_DATASET_COLUMNS = (
    "id, namespace, name, source, format, original_format, raw_path, path, "
    "ingest_status, ingest_config_json, created_at, updated_at, schema_json, "
    "row_count, lineage_json, tags_json, description, error"
)

_NAMESPACE_CATALOG_COLUMNS = (
    "namespace, display_name, description, is_active, created_by_user_id, created_at, updated_at"
)

_MODEL_REGISTRY_COLUMNS = (
    "id, name, model_id, protocol, base_url, api_key, tags_json, description, status, "
    "params_json, created_at, updated_at"
)


def ensure_namespace_catalog_entry(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    display_name: str | None = None,
    description: str | None = None,
    created_by_user_id: str | None = None,
    is_active: bool = True,
) -> NamespaceCatalogRow:
    now = utc_now_ts()
    conn.execute(
        """
        INSERT OR IGNORE INTO namespace_catalog (
          namespace, display_name, description, is_active, created_by_user_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            namespace,
            display_name or namespace,
            description,
            1 if is_active else 0,
            created_by_user_id,
            now,
            now,
        ),
    )
    row = conn.execute(
        f"SELECT {_NAMESPACE_CATALOG_COLUMNS} FROM namespace_catalog WHERE namespace = ?",
        (namespace,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to ensure namespace catalog entry")
    return _row_to_namespace_catalog(row)


def create_namespace_catalog_entry(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    display_name: str,
    description: str | None = None,
    created_by_user_id: str | None = None,
) -> NamespaceCatalogRow:
    now = utc_now_ts()
    try:
        conn.execute(
            """
            INSERT INTO namespace_catalog (
              namespace, display_name, description, is_active, created_by_user_id, created_at, updated_at
            )
            VALUES (?, ?, ?, 1, ?, ?, ?)
            """,
            (namespace, display_name, description, created_by_user_id, now, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("namespace_or_display_name_exists") from exc
    row = conn.execute(
        f"SELECT {_NAMESPACE_CATALOG_COLUMNS} FROM namespace_catalog WHERE namespace = ?",
        (namespace,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load created namespace catalog entry")
    return _row_to_namespace_catalog(row)


def get_namespace_catalog(
    conn: sqlite3.Connection,
    *,
    namespace: str,
) -> NamespaceCatalogRow | None:
    row = conn.execute(
        f"SELECT {_NAMESPACE_CATALOG_COLUMNS} FROM namespace_catalog WHERE namespace = ?",
        (namespace,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_namespace_catalog(row)


def list_namespace_catalog(
    conn: sqlite3.Connection,
    *,
    include_inactive: bool = False,
    limit: int = 500,
    offset: int = 0,
) -> list[NamespaceCatalogRow]:
    where = "1=1" if include_inactive else "is_active = 1"
    rows = conn.execute(
        f"""
        SELECT {_NAMESPACE_CATALOG_COLUMNS}
        FROM namespace_catalog
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()
    return [_row_to_namespace_catalog(row) for row in rows]


def list_namespace_values(
    conn: sqlite3.Connection,
    *,
    include_inactive: bool = False,
) -> list[str]:
    where = "1=1" if include_inactive else "is_active = 1"
    rows = conn.execute(
        f"SELECT namespace FROM namespace_catalog WHERE {where} ORDER BY namespace ASC"
    ).fetchall()
    return [str(row["namespace"]) for row in rows]


def update_namespace_catalog(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    display_name: str | Any = _UNSET,
    description: str | None | Any = _UNSET,
    is_active: bool | Any = _UNSET,
) -> NamespaceCatalogRow:
    updates: list[str] = []
    params: list[Any] = []

    if display_name is not _UNSET:
        updates.append("display_name = ?")
        params.append(display_name)
    if description is not _UNSET:
        updates.append("description = ?")
        params.append(description)
    if is_active is not _UNSET:
        updates.append("is_active = ?")
        params.append(1 if bool(is_active) else 0)

    if not updates:
        existing = get_namespace_catalog(conn, namespace=namespace)
        if existing is None:
            raise ValueError("namespace_not_found")
        return existing

    updates.append("updated_at = ?")
    params.append(utc_now_ts())
    params.append(namespace)
    try:
        conn.execute(
            f"UPDATE namespace_catalog SET {', '.join(updates)} WHERE namespace = ?",
            tuple(params),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("display_name_exists") from exc

    row = conn.execute(
        f"SELECT {_NAMESPACE_CATALOG_COLUMNS} FROM namespace_catalog WHERE namespace = ?",
        (namespace,),
    ).fetchone()
    if row is None:
        raise ValueError("namespace_not_found")
    return _row_to_namespace_catalog(row)


def list_namespace_users(
    conn: sqlite3.Connection,
    *,
    namespace: str,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          m.user_id,
          m.namespace,
          m.role,
          m.created_at,
          m.updated_at,
          u.username,
          u.email,
          u.is_active,
          u.platform_role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.namespace = ?
        ORDER BY m.updated_at DESC
        """,
        (namespace,),
    ).fetchall()
    return [
        {
            "user_id": str(row["user_id"]),
            "namespace": str(row["namespace"]),
            "role": str(row["role"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
            "username": str(row["username"]),
            "email": str(row["email"]) if row["email"] is not None else None,
            "is_active": bool(row["is_active"]),
            "platform_role": str(row["platform_role"]),
        }
        for row in rows
    ]


def remove_membership(conn: sqlite3.Connection, *, user_id: str, namespace: str) -> None:
    conn.execute(
        "DELETE FROM memberships WHERE user_id = ? AND namespace = ?",
        (user_id, namespace),
    )


def list_namespace_groups(
    conn: sqlite3.Connection,
    *,
    namespace: str,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          gnr.group_id,
          gnr.namespace,
          gnr.role,
          gnr.created_at,
          gnr.updated_at,
          g.name,
          g.description
        FROM group_namespace_roles gnr
        JOIN groups g ON g.id = gnr.group_id
        WHERE gnr.namespace = ?
        ORDER BY gnr.updated_at DESC
        """,
        (namespace,),
    ).fetchall()
    return [
        {
            "group_id": str(row["group_id"]),
            "namespace": str(row["namespace"]),
            "role": str(row["role"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
            "name": str(row["name"]),
            "description": str(row["description"]) if row["description"] is not None else None,
        }
        for row in rows
    ]


def list_effective_memberships(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    include_inactive: bool = True,
) -> list[dict[str, Any]]:
    role_rank: dict[str, int] = {"viewer": 0, "editor": 1, "namespace_admin": 2}
    direct = list_memberships(conn, user_id=user_id)
    effective: dict[str, dict[str, Any]] = {}

    for record in direct:
        namespace = str(record["namespace"])
        role = str(record["role"])
        created_at = int(record["created_at"])
        updated_at = int(record["updated_at"])
        existing = effective.get(namespace)
        if existing is None or role_rank.get(role, -1) > role_rank.get(str(existing["role"]), -1):
            effective[namespace] = {
                "namespace": namespace,
                "role": role,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        elif existing is not None and updated_at > int(existing["updated_at"]):
            existing["updated_at"] = updated_at

    if not effective:
        return []

    namespaces = list(effective.keys())
    placeholders = ",".join("?" for _ in namespaces)
    rows = conn.execute(
        f"""
        SELECT namespace, display_name, description, is_active
        FROM namespace_catalog
        WHERE namespace IN ({placeholders})
        """,
        tuple(namespaces),
    ).fetchall()
    catalog = {
        str(row["namespace"]): {
            "display_name": str(row["display_name"]),
            "description": str(row["description"]) if row["description"] is not None else None,
            "is_active": bool(row["is_active"]),
        }
        for row in rows
    }

    results: list[dict[str, Any]] = []
    for namespace, value in effective.items():
        meta = catalog.get(namespace)
        is_active = bool(meta["is_active"]) if meta is not None else True
        if not include_inactive and not is_active:
            continue
        results.append(
            {
                **value,
                "display_name": (
                    str(meta["display_name"]) if meta is not None else namespace
                ),
                "description": meta["description"] if meta is not None else None,
                "is_active": is_active,
            }
        )
    results.sort(key=lambda item: str(item["namespace"]))
    return results


def list_model_registry(
    conn: sqlite3.Connection,
    *,
    include_inactive: bool = True,
    limit: int = 500,
    offset: int = 0,
) -> list[ModelRegistryRow]:
    where = "1=1" if include_inactive else "status = 'active'"
    rows = conn.execute(
        f"""
        SELECT {_MODEL_REGISTRY_COLUMNS}
        FROM model_registry
        WHERE {where}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()
    return [_row_to_model_registry(row) for row in rows]


def get_model_registry(conn: sqlite3.Connection, *, model_id: str) -> ModelRegistryRow | None:
    row = conn.execute(
        f"SELECT {_MODEL_REGISTRY_COLUMNS} FROM model_registry WHERE id = ?",
        (model_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_model_registry(row)


def upsert_model_registry(
    conn: sqlite3.Connection,
    *,
    model_id: str | None,
    name: str,
    llm_model_id: str,
    protocol: str,
    base_url: str,
    api_key: str,
    tags: list[str] | None,
    description: str,
    status: str,
    params: dict[str, Any] | None = None,
) -> ModelRegistryRow:
    now = utc_now_ts()
    record_id = model_id or str(uuid.uuid4())
    existing = get_model_registry(conn, model_id=record_id)
    if existing is None:
        conn.execute(
            """
            INSERT INTO model_registry (
              id, name, model_id, protocol, base_url, api_key, tags_json,
              description, status, params_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id,
                name,
                llm_model_id,
                protocol,
                base_url,
                api_key,
                json.dumps(tags or []),
                description,
                status,
                json.dumps(params) if params is not None else None,
                now,
                now,
            ),
        )
    else:
        conn.execute(
            """
            UPDATE model_registry
            SET
              name = ?,
              model_id = ?,
              protocol = ?,
              base_url = ?,
              api_key = ?,
              tags_json = ?,
              description = ?,
              status = ?,
              params_json = ?,
              updated_at = ?
            WHERE id = ?
            """,
            (
                name,
                llm_model_id,
                protocol,
                base_url,
                api_key,
                json.dumps(tags or []),
                description,
                status,
                json.dumps(params) if params is not None else None,
                now,
                record_id,
            ),
        )
    row = conn.execute(
        f"SELECT {_MODEL_REGISTRY_COLUMNS} FROM model_registry WHERE id = ?",
        (record_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load upserted model registry row")
    return _row_to_model_registry(row)


def delete_model_registry(conn: sqlite3.Connection, *, model_id: str) -> None:
    conn.execute("DELETE FROM model_registry WHERE id = ?", (model_id,))


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


def count_active_platform_admins(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS count
        FROM users
        WHERE platform_role = 'platform_admin' AND is_active = 1
        """
    ).fetchone()
    if row is None:
        return 0
    return int(row["count"])


def create_group(
    conn: sqlite3.Connection,
    *,
    name: str,
    description: str | None = None,
) -> GroupRow:
    now = utc_now_ts()
    group_id = str(uuid.uuid4())
    try:
        conn.execute(
            """
            INSERT INTO groups (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (group_id, name, description, now, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("group_name_exists") from exc

    row = conn.execute(
        "SELECT id, name, description, created_at, updated_at FROM groups WHERE id = ?",
        (group_id,),
    ).fetchone()
    if row is None:
        raise ValueError("group_not_found")
    return _row_to_group(row)


def list_groups(conn: sqlite3.Connection, *, limit: int = 200, offset: int = 0) -> list[GroupRow]:
    rows = conn.execute(
        """
        SELECT id, name, description, created_at, updated_at
        FROM groups
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    ).fetchall()
    return [_row_to_group(row) for row in rows]


def get_group_by_id(conn: sqlite3.Connection, group_id: str) -> GroupRow | None:
    row = conn.execute(
        "SELECT id, name, description, created_at, updated_at FROM groups WHERE id = ?",
        (group_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_group(row)


def update_group(
    conn: sqlite3.Connection,
    *,
    group_id: str,
    name: str | None = None,
    description: str | None = None,
) -> GroupRow:
    updates: list[str] = []
    params: list[Any] = []
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if description is not None:
        updates.append("description = ?")
        params.append(description)

    if not updates:
        existing = get_group_by_id(conn, group_id)
        if existing is None:
            raise ValueError("group_not_found")
        return existing

    now = utc_now_ts()
    updates.append("updated_at = ?")
    params.append(now)
    params.append(group_id)
    try:
        conn.execute(
            f"UPDATE groups SET {', '.join(updates)} WHERE id = ?",
            tuple(params),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("group_name_exists") from exc

    row = conn.execute(
        "SELECT id, name, description, created_at, updated_at FROM groups WHERE id = ?",
        (group_id,),
    ).fetchone()
    if row is None:
        raise ValueError("group_not_found")
    return _row_to_group(row)


def delete_group(conn: sqlite3.Connection, group_id: str) -> None:
    cur = conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
    if cur.rowcount == 0:
        raise ValueError("group_not_found")


def add_group_member(conn: sqlite3.Connection, *, group_id: str, user_id: str) -> None:
    now = utc_now_ts()
    try:
        conn.execute(
            """
            INSERT INTO group_memberships (group_id, user_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(group_id, user_id) DO NOTHING
            """,
            (group_id, user_id, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("group_or_user_not_found") from exc


def remove_group_member(conn: sqlite3.Connection, *, group_id: str, user_id: str) -> None:
    conn.execute(
        "DELETE FROM group_memberships WHERE group_id = ? AND user_id = ?",
        (group_id, user_id),
    )


def list_group_members(conn: sqlite3.Connection, *, group_id: str) -> list[GroupMemberRow]:
    rows = conn.execute(
        """
        SELECT
          gm.group_id,
          u.id AS user_id,
          u.username,
          u.email,
          u.is_active,
          u.platform_role,
          gm.created_at AS joined_at
        FROM group_memberships gm
        JOIN users u ON gm.user_id = u.id
        WHERE gm.group_id = ?
        ORDER BY gm.created_at DESC
        """,
        (group_id,),
    ).fetchall()
    return [_row_to_group_member(row) for row in rows]


def upsert_group_namespace_role(
    conn: sqlite3.Connection,
    *,
    group_id: str,
    namespace: str,
    role: NamespaceRole,
) -> None:
    now = utc_now_ts()
    ensure_namespace_catalog_entry(conn, namespace=namespace)
    conn.execute(
        """
        INSERT INTO group_namespace_roles (group_id, namespace, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(group_id, namespace) DO UPDATE SET role=excluded.role, updated_at=excluded.updated_at
        """,
        (group_id, namespace, role, now, now),
    )


def remove_group_namespace_role(conn: sqlite3.Connection, *, group_id: str, namespace: str) -> None:
    conn.execute(
        "DELETE FROM group_namespace_roles WHERE group_id = ? AND namespace = ?",
        (group_id, namespace),
    )


def list_group_namespace_roles(conn: sqlite3.Connection, *, group_id: str) -> list[GroupNamespaceAccessRow]:
    rows = conn.execute(
        """
        SELECT group_id, namespace, role, created_at, updated_at
        FROM group_namespace_roles
        WHERE group_id = ?
        ORDER BY namespace ASC
        """,
        (group_id,),
    ).fetchall()
    return [_row_to_group_namespace_access(row) for row in rows]


def list_group_roles_for_namespace(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    namespace: str,
) -> list[NamespaceRole]:
    rows = conn.execute(
        """
        SELECT gnr.role
        FROM group_memberships gm
        JOIN group_namespace_roles gnr ON gm.group_id = gnr.group_id
        WHERE gm.user_id = ? AND gnr.namespace = ?
        """,
        (user_id, namespace),
    ).fetchall()
    return [str(row["role"]) for row in rows]  # type: ignore[return-value]


def list_group_namespace_access_for_user(
    conn: sqlite3.Connection,
    *,
    user_id: str,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT gnr.namespace, gnr.role, gnr.created_at, gnr.updated_at
        FROM group_memberships gm
        JOIN group_namespace_roles gnr ON gm.group_id = gnr.group_id
        WHERE gm.user_id = ?
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
) -> None:
    now = utc_now_ts()
    ensure_namespace_catalog_entry(conn, namespace=namespace)
    conn.execute(
        """
        INSERT INTO memberships (user_id, namespace, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, namespace) DO UPDATE SET role=excluded.role, updated_at=excluded.updated_at
        """,
        (user_id, namespace, "editor", now, now),
    )


def list_memberships(conn: sqlite3.Connection, *, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT
          m.namespace,
          m.role,
          m.created_at,
          m.updated_at,
          nc.display_name
        FROM memberships m
        LEFT JOIN namespace_catalog nc ON nc.namespace = m.namespace
        WHERE m.user_id = ?
        ORDER BY m.namespace ASC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "namespace": str(row["namespace"]),
            "role": str(row["role"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
            "display_name": (
                str(row["display_name"])
                if row["display_name"] is not None
                else str(row["namespace"])
            ),
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
    namespace: str | None,
    status: str | None = None,
    pipeline_id: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[RunRow]:
    where: list[str] = []
    params: list[Any] = []
    if namespace is not None:
        where.append("namespace = ?")
        params.append(namespace)
    if status is not None:
        where.append("status = ?")
        params.append(status)
    if pipeline_id is not None:
        where.append("pipeline_id = ?")
        params.append(pipeline_id)

    where_sql = " AND ".join(where) if where else "1=1"
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


def get_run_summary(conn: sqlite3.Connection, *, namespace: str | None) -> dict[str, int | None]:
    where_sql = "WHERE namespace = ?" if namespace is not None else ""
    params: tuple[Any, ...] = (namespace,) if namespace is not None else ()
    row = conn.execute(
        f"""
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
          MAX(created_at) AS last_run_at
        FROM runs
        {where_sql}
        """,
        params,
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


def get_run_for_schedule(
    conn: sqlite3.Connection,
    *,
    deployment_id: str,
    scheduled_for: int,
) -> RunRow | None:
    row = conn.execute(
        f"""
        SELECT {_RUN_COLUMNS}
        FROM runs
        WHERE deployment_id = ? AND scheduled_for = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (deployment_id, scheduled_for),
    ).fetchone()
    if row is None:
        return None
    return _row_to_run(row)


def count_active_runs(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    pipeline_id: str | None = None,
) -> int:
    where = ["namespace = ?", "status IN ('pending', 'running')"]
    params: list[Any] = [namespace]
    if pipeline_id is not None:
        where.append("pipeline_id = ?")
        params.append(pipeline_id)

    row = conn.execute(
        f"""
        SELECT COUNT(*) AS total
        FROM runs
        WHERE {' AND '.join(where)}
        """,
        params,
    ).fetchone()
    if row is None:
        return 0
    return int(row["total"] or 0)


def list_active_runs(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    pipeline_id: str | None = None,
) -> list[RunRow]:
    where = ["namespace = ?", "status IN ('pending', 'running')"]
    params: list[Any] = [namespace]
    if pipeline_id is not None:
        where.append("pipeline_id = ?")
        params.append(pipeline_id)

    rows = conn.execute(
        f"""
        SELECT {_RUN_COLUMNS}
        FROM runs
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        """,
        params,
    ).fetchall()
    return [_row_to_run(row) for row in rows]


def create_deployment(
    conn: sqlite3.Connection,
    *,
    namespace: str,
    name: str,
    pipeline_id: str,
    enabled: bool,
    schedule_type: str,
    schedule: dict[str, Any],
    timezone: str,
    input_dataset_id: str | None = None,
    output_to_data_center: bool = False,
    output_dataset_name_tpl: str | None = None,
    misfire_policy: str = "run_once",
    max_catchup_runs: int | None = None,
    retry_policy: dict[str, Any] | None = None,
    concurrency_policy: dict[str, Any] | None = None,
    next_run_at: int | None = None,
) -> DeploymentRow:
    deployment_id = str(uuid.uuid4())
    now = utc_now_ts()
    conn.execute(
        f"""
        INSERT INTO deployments (
          id, namespace, name, pipeline_id, enabled, schedule_type, schedule_json,
          timezone, input_dataset_id, output_to_data_center, output_dataset_name_tpl,
          misfire_policy, max_catchup_runs, retry_policy_json, concurrency_policy_json,
          last_run_id, next_run_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        """,
        (
            deployment_id,
            namespace,
            name,
            pipeline_id,
            1 if enabled else 0,
            schedule_type,
            json.dumps(schedule),
            timezone,
            input_dataset_id,
            1 if output_to_data_center else 0,
            output_dataset_name_tpl,
            misfire_policy,
            max_catchup_runs,
            json.dumps(retry_policy) if retry_policy is not None else None,
            json.dumps(concurrency_policy) if concurrency_policy is not None else None,
            next_run_at,
            now,
            now,
        ),
    )
    row = conn.execute(
        f"SELECT {_DEPLOYMENT_COLUMNS} FROM deployments WHERE id = ?",
        (deployment_id,),
    ).fetchone()
    if row is None:
        raise RuntimeError("Failed to load created deployment")
    return _row_to_deployment(row)


def update_deployment(
    conn: sqlite3.Connection,
    deployment_id: str,
    *,
    name: str | None | Any = _UNSET,
    pipeline_id: str | None | Any = _UNSET,
    enabled: bool | None | Any = _UNSET,
    schedule_type: str | None | Any = _UNSET,
    schedule: dict[str, Any] | None | Any = _UNSET,
    timezone: str | None | Any = _UNSET,
    input_dataset_id: str | None | Any = _UNSET,
    output_to_data_center: bool | None | Any = _UNSET,
    output_dataset_name_tpl: str | None | Any = _UNSET,
    misfire_policy: str | None | Any = _UNSET,
    max_catchup_runs: int | None | Any = _UNSET,
    retry_policy: dict[str, Any] | None | Any = _UNSET,
    concurrency_policy: dict[str, Any] | None | Any = _UNSET,
    last_run_id: str | None | Any = _UNSET,
    next_run_at: int | None | Any = _UNSET,
) -> DeploymentRow:
    updates: list[str] = ["updated_at = ?"]
    params: list[Any] = [utc_now_ts()]

    if name is not _UNSET:
        updates.append("name = ?")
        params.append(name)
    if pipeline_id is not _UNSET:
        updates.append("pipeline_id = ?")
        params.append(pipeline_id)
    if enabled is not _UNSET:
        updates.append("enabled = ?")
        params.append(1 if enabled else 0)
    if schedule_type is not _UNSET:
        updates.append("schedule_type = ?")
        params.append(schedule_type)
    if schedule is not _UNSET:
        updates.append("schedule_json = ?")
        params.append(json.dumps(schedule) if schedule is not None else None)
    if timezone is not _UNSET:
        updates.append("timezone = ?")
        params.append(timezone)
    if input_dataset_id is not _UNSET:
        updates.append("input_dataset_id = ?")
        params.append(input_dataset_id)
    if output_to_data_center is not _UNSET:
        updates.append("output_to_data_center = ?")
        params.append(1 if output_to_data_center else 0)
    if output_dataset_name_tpl is not _UNSET:
        updates.append("output_dataset_name_tpl = ?")
        params.append(output_dataset_name_tpl)
    if misfire_policy is not _UNSET:
        updates.append("misfire_policy = ?")
        params.append(misfire_policy)
    if max_catchup_runs is not _UNSET:
        updates.append("max_catchup_runs = ?")
        params.append(max_catchup_runs)
    if retry_policy is not _UNSET:
        updates.append("retry_policy_json = ?")
        params.append(json.dumps(retry_policy) if retry_policy is not None else None)
    if concurrency_policy is not _UNSET:
        updates.append("concurrency_policy_json = ?")
        params.append(
            json.dumps(concurrency_policy) if concurrency_policy is not None else None
        )
    if last_run_id is not _UNSET:
        updates.append("last_run_id = ?")
        params.append(last_run_id)
    if next_run_at is not _UNSET:
        updates.append("next_run_at = ?")
        params.append(next_run_at)

    params.append(deployment_id)
    conn.execute(
        f"UPDATE deployments SET {', '.join(updates)} WHERE id = ?",
        params,
    )

    row = conn.execute(
        f"SELECT {_DEPLOYMENT_COLUMNS} FROM deployments WHERE id = ?",
        (deployment_id,),
    ).fetchone()
    if row is None:
        raise ValueError("deployment_not_found")
    return _row_to_deployment(row)


def get_deployment(conn: sqlite3.Connection, deployment_id: str) -> DeploymentRow | None:
    row = conn.execute(
        f"SELECT {_DEPLOYMENT_COLUMNS} FROM deployments WHERE id = ?",
        (deployment_id,),
    ).fetchone()
    if row is None:
        return None
    return _row_to_deployment(row)


def list_deployments(
    conn: sqlite3.Connection,
    *,
    namespace: str | None,
    enabled_only: bool = False,
    limit: int = 200,
    offset: int = 0,
) -> list[DeploymentRow]:
    where: list[str] = []
    params: list[Any] = []
    if namespace is not None:
        where.append("namespace = ?")
        params.append(namespace)
    if enabled_only:
        where.append("enabled = 1")
    where_sql = " AND ".join(where) if where else "1=1"
    rows = conn.execute(
        f"""
        SELECT {_DEPLOYMENT_COLUMNS}
        FROM deployments
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (*params, limit, offset),
    ).fetchall()
    return [_row_to_deployment(row) for row in rows]


def delete_deployment(conn: sqlite3.Connection, deployment_id: str) -> None:
    conn.execute("DELETE FROM deployments WHERE id = ?", (deployment_id,))


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


def delete_dataset(conn: sqlite3.Connection, dataset_id: str) -> None:
    conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))


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
    namespace: str | None,
    source: str | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[DatasetRow]:
    where: list[str] = []
    params: list[Any] = []
    if namespace is not None:
        where.append("namespace = ?")
        params.append(namespace)
    if source is not None:
        where.append("source = ?")
        params.append(source)

    where_sql = " AND ".join(where) if where else "1=1"
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
