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


def get_namespace_dir(namespace: str) -> Path:
    """Return the namespace root directory."""
    return get_docetl_root_dir() / namespace


def get_data_center_dir(namespace: str) -> Path:
    """Return the data center root directory for a namespace."""
    return get_namespace_dir(namespace) / "data_center"


def get_data_center_raw_dir(namespace: str) -> Path:
    """Return the raw upload directory for a namespace."""
    return get_data_center_dir(namespace) / "raw"


def get_data_center_dataset_dir(namespace: str, source: str) -> Path:
    """Return the normalized dataset directory for a namespace."""
    bucket = "generated" if source == "pipeline_generated" else "user"
    return get_data_center_dir(namespace) / "datasets" / bucket
