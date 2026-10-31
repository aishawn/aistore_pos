import importlib.util
from datetime import datetime, timezone, timedelta
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "ai-eval" / "check-inventory-history-freshness.py"
SPEC = importlib.util.spec_from_file_location("history_freshness", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def history(generated_at, *, continuity="CONTIGUOUS", observed=1):
    return {
        "generatedAt": generated_at,
        "snapshotDates": ["2026-10-31"],
        "observedDays": observed,
        "continuityStatus": continuity,
        "backtestReadiness": "INSUFFICIENT_HISTORY",
    }


def test_fresh_history_is_reported_but_can_remain_not_ready_for_backtest():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    report = MODULE.check(history("2026-10-31T05:00:00+00:00"), now, 36, 28)
    assert report["status"] == "NOT_READY"
    assert "insufficient_observed_days" in report["reasons"]


def test_stale_history_fails_closed():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    payload = history("2026-10-31T05:00:00+00:00")
    payload["snapshotDates"] = ["2026-10-29"]
    report = MODULE.check(payload, now, 36, 0)
    assert report["status"] == "STALE"
    assert "history_stale" in report["reasons"]


def test_gapped_history_is_not_ready():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    payload = history("2026-10-31T05:00:00+00:00")
    payload["snapshotDates"] = ["2026-10-29", "2026-10-31"]
    report = MODULE.check(payload, now, 36, 0)
    assert report["status"] == "NOT_READY"
    assert "snapshot_date_gaps" in report["reasons"]


def test_rebuild_cannot_refresh_stale_capture():
    now = datetime(2026, 11, 3, 6, tzinfo=timezone.utc)
    payload = history(now.isoformat())
    payload["latestCapturedAt"] = "2026-10-31T05:00:00+00:00"
    report = MODULE.check(payload, now, 36, 0)
    assert report["status"] == "STALE"
    assert report["ageHours"] == 73


def test_future_capture_fails_closed():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    payload = history(now.isoformat())
    payload["latestCapturedAt"] = "2026-10-31T07:00:00+00:00"
    assert MODULE.check(payload, now, 36, 0)["status"] == "INVALID"


def test_duplicate_dates_do_not_inflate_readiness():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    payload = history(now.isoformat(), observed=28)
    payload["snapshotDates"] *= 28
    report = MODULE.check(payload, now, 36, 28)
    assert report["observedDays"] == 1
    assert report["status"] == "NOT_READY"
