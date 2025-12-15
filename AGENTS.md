# Repository Guidelines

## Project Structure & Module Organization
- `docetl/`: Core Python package (operators, optimizers, runners, CLI entrypoints).
- `server/app/`: FastAPI backend powering the playground (`main.py` entrypoint).
- `website/`: Next.js/TypeScript UI for DocWrangler.
- `tests/`: Pytest suite; fixtures in `tests/data`, smoke checks in `tests/basic`.
- Supporting assets: `docs/` (MkDocs), `example_data/`, `experiments/`.

## Build, Test, and Development Commands
- `make install`: Install Python deps via `uv` (all extras) and set up pre-commit hooks.
- `make tests` / `make tests-basic`: Full vs. fast pytest runs; use the basic target for quick validation.
- `make lint`: Run Ruff with `--fix` on `docetl/`; `make mypy`: type-check the package.
- UI: `make run-ui-dev` starts the FastAPI server and Next.js dev server; `make run-ui` builds/serves the production UI.
- Docker: `make docker` builds and runs the stack (ports 3000/8000); `make docker-clean` drops the volume.
- Docs: `make docs-serve` launches MkDocs on port 8001.

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indent, type every function (mypy disallows untyped defs). Modules/functions use `snake_case`; classes `CamelCase`.
- Ruff enforces style (F405 ignored for intentional star imports). Add concise docstrings for public APIs.
- Tests live in `tests/` with files named `test_*.py`; mirror package layout when adding coverage.
- Frontend: follow existing TypeScript/Next.js patterns in `website/`, PascalCase components, co-locate styles.

## Testing Guidelines
- Default to `make tests` before proposing changes; use targeted runs (`uv run pytest tests/path::TestClass::test_name`) while iterating.
- Add regression tests alongside new features or fixes; keep fixtures small and reusable via `tests/conftest.py`.
- Ranking and `test_ollama.py` are heavier and skipped by default; run them explicitly when relevant.

## Commit & Pull Request Guidelines
- Commit messages follow a conventional style in history (`feat: ...`, `fix: ...`, `chore: ...`); keep commits focused and reversible.
- PRs should include a short summary, linked issues, and a test plan with commands run. Add screenshots/GIFs for UI changes in `website/`.
- Ensure lint, mypy, and relevant tests pass; call out skipped checks and why.

## Security & Configuration Tips
- Do not commit secrets. Backend config lives in the root `.env`; UI keys go in `website/.env.local`. Use placeholder values in docs or PRs.
- For AWS/Bedrock use, verify credentials with `make test-aws`. Redact keys and sensitive URLs in logs and examples.
