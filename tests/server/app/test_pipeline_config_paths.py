from __future__ import annotations

import os
from pathlib import Path

import yaml

from server.app.routes.pipeline import _validate_pipeline_config_paths


def test_validate_pipeline_config_allows_relative_paths(tmp_path: Path, monkeypatch) -> None:
    home_dir = tmp_path / "docetl_home"
    home_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("DOCETL_HOME_DIR", str(home_dir))

    namespace = "demo"
    namespace_root = home_dir / ".docetl" / namespace
    output_path = namespace_root / "pipelines" / "outputs" / "demo.json"
    intermediate_dir = namespace_root / "pipelines" / "demo" / "intermediates"

    cwd = Path.cwd()
    relative_output = os.path.relpath(output_path, cwd)
    relative_intermediate = os.path.relpath(intermediate_dir, cwd)

    config = {
        "pipeline": {
            "output": {
                "path": relative_output,
                "intermediate_dir": relative_intermediate,
            }
        }
    }
    yaml_path = tmp_path / "pipeline.yaml"
    yaml_path.write_text(yaml.safe_dump(config))

    _validate_pipeline_config_paths(namespace=namespace, yaml_path=yaml_path)
