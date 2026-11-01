"""Check whether the native inventory history is fresh and backtestable."""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def check(history: dict, now: datetime, max_age_hours: float, require_days: int) -> dict:
    dates = history.get("snapshotDates")
    generated = history.get("generatedAt")
    if not isinstance(dates, list) or not dates or not isinstance(generated, str):
        return {"status": "INVALID", "reason": "history_missing_snapshot_dates_or_generated_at"}
    try:
        generated_at = datetime.fromisoformat(generated.replace("Z", "+00:00"))
        if generated_at.tzinfo is None:
            generated_at = generated_at.replace(tzinfo=timezone.utc)
    except ValueError:
        return {"status": "INVALID", "reason": "generatedAt_invalid"}
    try:
        parsed_dates = sorted({date.fromisoformat(value) for value in dates})
        business_timezone = str(history.get("businessTimezone") or "UTC")
        business_zone = ZoneInfo(business_timezone)
        captured = history.get("latestCapturedAt")
        # Legacy histories lack capture time: use UTC midnight conservatively.
        captured_at = datetime.fromisoformat(captured.replace("Z", "+00:00")) if captured else datetime.combine(parsed_dates[-1], datetime.min.time(), timezone.utc)
        if captured_at.tzinfo is None or captured_at.astimezone(business_zone).date() != parsed_dates[-1]:
            raise ValueError("capture timestamp does not match snapshot dates")
    except (ValueError, TypeError, AttributeError, ZoneInfoNotFoundError):
        return {"status": "INVALID", "reason": "snapshot_capture_time_invalid"}
    age_hours = (now - captured_at.astimezone(timezone.utc)).total_seconds() / 3600
    if age_hours < 0:
        return {"status": "INVALID", "reason": "snapshot_capture_in_future"}
    observed_days = len(parsed_dates)
    continuity = "CONTIGUOUS" if (parsed_dates[-1] - parsed_dates[0]).days + 1 == observed_days else "GAPS_PRESENT"
    reasons: list[str] = []
    if age_hours > max_age_hours:
        reasons.append("history_stale")
    if continuity == "GAPS_PRESENT":
        reasons.append("snapshot_date_gaps")
    if require_days and observed_days < require_days:
        reasons.append("insufficient_observed_days")
    status = "FRESH" if not reasons else "STALE" if "history_stale" in reasons else "NOT_READY"
    return {
        "status": status,
        "generatedAt": generated_at.isoformat(),
        "latestCapturedAt": captured_at.isoformat(),
        "businessTimezone": business_timezone,
        "ageHours": round(age_hours, 2),
        "latestSnapshotDate": max(str(value) for value in dates),
        "observedDays": observed_days,
        "continuityStatus": continuity,
        "backtestReadiness": history.get("backtestReadiness"),
        "reasons": reasons,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("history", type=Path)
    parser.add_argument("--max-age-hours", type=float, default=36)
    parser.add_argument("--require-days", type=int, default=0)
    args = parser.parse_args()
    try:
        history = json.loads(args.history.read_text(encoding="utf-8"))
        report = check(history, datetime.now(timezone.utc), args.max_age_hours, args.require_days)
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "INVALID", "reason": str(error)}))
        return 1
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "FRESH" and not report.get("reasons") else 2


if __name__ == "__main__":
    raise SystemExit(main())
