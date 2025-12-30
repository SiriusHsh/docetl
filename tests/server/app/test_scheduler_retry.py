from __future__ import annotations

from server.app import scheduler


def test_compute_retry_delay_seconds() -> None:
    assert scheduler.compute_retry_delay_seconds(None, 2) == 0

    policy = {
        "backoff_seconds": 10,
        "backoff_multiplier": 2,
        "max_backoff_seconds": 25,
    }
    assert scheduler.compute_retry_delay_seconds(policy, 1) == 0
    assert scheduler.compute_retry_delay_seconds(policy, 2) == 10
    assert scheduler.compute_retry_delay_seconds(policy, 3) == 20
    assert scheduler.compute_retry_delay_seconds(policy, 4) == 25


def test_max_attempts_defaults() -> None:
    assert scheduler._max_attempts(None) == 1
    assert scheduler._max_attempts({"max_attempts": 3}) == 3
    assert scheduler._max_attempts({"max_attempts": 0}) == 1
    assert scheduler._max_attempts({"max_attempts": "2"}) == 2
