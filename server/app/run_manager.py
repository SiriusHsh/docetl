from __future__ import annotations

from threading import Lock
from typing import Callable


_RUN_CANCEL_HANDLERS: dict[str, Callable[[], None]] = {}
_LOCK = Lock()


def register_run(run_id: str, cancel: Callable[[], None]) -> None:
    with _LOCK:
        _RUN_CANCEL_HANDLERS[run_id] = cancel


def unregister_run(run_id: str) -> None:
    with _LOCK:
        _RUN_CANCEL_HANDLERS.pop(run_id, None)


def cancel_run(run_id: str) -> bool:
    with _LOCK:
        cancel = _RUN_CANCEL_HANDLERS.get(run_id)
    if cancel is None:
        return False
    cancel()
    return True
