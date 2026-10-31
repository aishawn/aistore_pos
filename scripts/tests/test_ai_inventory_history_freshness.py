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
    report = MODULE.check(history("2026-10-29T00:00:00+00:00"), now, 36, 0)
    assert report["status"] == "STALE"
    assert "history_stale" in report["reasons"]


def test_gapped_history_is_not_ready():
    now = datetime(2026, 10, 31, 6, tzinfo=timezone.utc)
    report = MODULE.check(history("2026-10-31T05:00:00+00:00", continuity="GAPS_PRESENT"), now, 36, 0)
    assert report["status"] == "NOT_READY"
    assert "snapshot_date_gaps" in report["reasons"]
