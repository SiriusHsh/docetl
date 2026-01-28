from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Iterator

from server.app.storage.metadata_db import ensure_bootstrap_admin, get_connection, init_schema
from server.app.storage.paths import get_platform_db_path


_INIT_LOCK = threading.Lock()
_INITIALIZED: set[str] = set()


def init_metadata_db(db_path: Path | None = None) -> None:
    path = db_path or get_platform_db_path()
    conn = get_connection(path)
    try:
        init_schema(conn)
        ensure_bootstrap_admin(conn)
        conn.commit()
    finally:
        conn.close()


def _ensure_initialized(db_path: Path) -> None:
    path_key = str(db_path)
    if path_key in _INITIALIZED:
        conn = get_connection(db_path)
        try:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                ("group_memberships",),
            ).fetchone()
            if row is not None:
                return
        finally:
            conn.close()
    with _INIT_LOCK:
        if path_key in _INITIALIZED:
            conn = get_connection(db_path)
            try:
                row = conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                    ("group_memberships",),
                ).fetchone()
                if row is not None:
                    return
            finally:
                conn.close()
        init_metadata_db(db_path)
        _INITIALIZED.add(path_key)


def get_db() -> Iterator[sqlite3.Connection]:
    db_path = get_platform_db_path()
    _ensure_initialized(db_path)
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
