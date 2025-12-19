from __future__ import annotations

import os
from pathlib import Path


def get_home_dir() -> Path:
    """Return the home directory used by the backend for storing artifacts."""
    return Path(os.getenv("DOCETL_HOME_DIR", str(Path.home()))).expanduser()


def get_docetl_root_dir() -> Path:
    """Return the root `.docetl` directory."""
    return get_home_dir() / ".docetl"


def get_platform_dir() -> Path:
    """Return the platform-scoped directory for shared metadata."""
    return get_docetl_root_dir() / "_platform"


def get_platform_db_path() -> Path:
    """Return the path to the platform metadata database file."""
    return get_platform_dir() / "platform.db"

