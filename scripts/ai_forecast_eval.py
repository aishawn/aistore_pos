"""Run a deterministic, read-only forecast evaluation against a JSON snapshot.

Usage: python scripts/ai_forecast_eval.py [snapshot.json] [report.json]
The snapshot is intentionally a file, never a live Odoo/SKR connection.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "forecast-service"))
from app.forecast_engine import backtest, forecast
from app.schemas import BacktestRequest, ForecastRequest, Series


def source_sha(snapshot: Path) -> str:
    try:
        return subprocess.check_output(["git", "hash-object", str(snapshot)], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        return "unavailable"


def rolling_metrics(series: Series, horizon: int, model: str = "seasonal_naive_v1") -> dict:
    """Evaluate every available horizon ending at the snapshot tail."""
    if any((right - left).days != 1 for left, right in zip(series.dates, series.dates[1:])):
        return {"productId": series.productId, "horizonDays": horizon, "status": "BLOCKED",
                "reason": "non-daily observations; zero-sales/open-day calendar unavailable"}
    if len(series.units) <= horizon + 7:
        return {"productId": series.productId, "horizonDays": horizon, "status": "BLOCKED"}
    windows = []
    first_origin = max(14, horizon + 7)
    for end in range(first_origin, len(series.units) + 1, horizon):
        if end + horizon > len(series.units):
            break
        train = Series(productId=series.productId, dates=series.dates[:end], units=series.units[:end],
                       stockoutFlags=series.stockoutFlags[:end])
        if model == "seasonal_naive_v1":
            response = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=horizon,
                                                 forecastStartDate=series.dates[end - 1], series=[train]))
            points = response.items[0].forecast
        elif model == "moving_average_7_v1":
            from app.schemas import ForecastPoint
            usable = [value for index, value in enumerate(train.units)
                      if not (index < len(train.stockoutFlags) and train.stockoutFlags[index])]
            average = sum(usable[-7:]) / len(usable[-7:]) if usable else 0.0
            points = [ForecastPoint(date=series.dates[end - 1], p50=average,
                                    p80=average, p90=average) for _ in range(horizon)]
        elif model in ("croston_sba_v1", "tsb_v1"):
            from app.schemas import ForecastPoint
            alpha = 0.1
            usable = [max(0.0, value) if index >= len(train.stockoutFlags) or not train.stockoutFlags[index] else None
                      for index, value in enumerate(train.units)]
            observed = [value for value in usable if value is not None]
            positives = [value for value in observed if value > 0]
            if not positives:
                prediction = 0.0
            elif model == "croston_sba_v1":
                size = positives[0]
                interval = next((index + 1 for index, value in enumerate(observed) if value > 0), 1)
                elapsed = 0
                for value in observed[interval:]:
                    elapsed += 1
                    if value > 0:
                        size = alpha * value + (1 - alpha) * size
                        interval = alpha * elapsed + (1 - alpha) * interval
                        elapsed = 0
                prediction = (1 - alpha / 2) * size / max(interval, 1e-9)
            else:
                demand_probability = len(positives) / max(len(observed), 1)
                size = sum(positives) / len(positives)
                for value in observed:
                    occurrence = 1.0 if value > 0 else 0.0
                    demand_probability = alpha * occurrence + (1 - alpha) * demand_probability
                    if value > 0:
                        size = alpha * value + (1 - alpha) * size
                prediction = demand_probability * size
            points = [ForecastPoint(date=series.dates[end - 1], p50=prediction,
                                    p80=prediction, p90=prediction) for _ in range(horizon)]
        else:
            raise ValueError(f"unsupported evaluation model: {model}")
        evaluation_flags = series.stockoutFlags[end:end + horizon] if series.stockoutFlags else []
        comparable = [
            (point, max(0.0, float(value)))
            for index, (point, value) in enumerate(zip(points, series.units[end:end + horizon]))
            if not (index < len(evaluation_flags) and evaluation_flags[index])
        ]
        if not comparable:
            continue
        errors = [point.p50 - value for point, value in comparable]
        actual = [value for _, value in comparable]
        denominator = sum(actual)
        windows.append({
            "wape": sum(abs(error) for error in errors) / denominator if denominator else None,
            "mae": sum(abs(error) for error in errors) / len(errors),
            "bias": sum(errors) / len(errors),
            "p80Coverage": sum(value <= point.p80 for point, value in comparable) / len(actual)
            if model == "seasonal_naive_v1" else None,
            "p90Coverage": sum(value <= point.p90 for point, value in comparable) / len(actual)
            if model == "seasonal_naive_v1" else None,
            "censored": any(evaluation_flags) or any(series.stockoutFlags[:end]),
        })
    if not windows:
        return {"productId": series.productId, "horizonDays": horizon, "status": "BLOCKED"}
    numeric = lambda name: [row[name] for row in windows if row[name] is not None]
    return {
        "productId": series.productId,
        "horizonDays": horizon,
        "model": model,
        "status": "PASS",
        "windowCount": len(windows),
        "meanWape": sum(numeric("wape")) / len(numeric("wape")) if numeric("wape") else None,
        "meanMae": sum(numeric("mae")) / len(numeric("mae")),
        "meanBias": sum(numeric("bias")) / len(numeric("bias")),
        "p80Coverage": sum(numeric("p80Coverage")) / len(numeric("p80Coverage")) if numeric("p80Coverage") else None,
        "p90Coverage": sum(numeric("p90Coverage")) / len(numeric("p90Coverage")) if numeric("p90Coverage") else None,
        "censoredWindowCount": sum(1 for row in windows if row["censored"]),
    }


def main() -> int:
    snapshot = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "forecast-service" / "fixtures" / "skr-snapshot-demo.json"
    if not snapshot.is_absolute():
        snapshot = (Path.cwd() / snapshot).resolve()
    if not snapshot.is_file():
        raise FileNotFoundError(f"forecast snapshot not found: {snapshot}")
    report_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "reports" / "ai-forecast-eval.json"
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    horizon = payload.get("horizonDays", 7)
    raw_series = payload["series"]
    quality = payload.get("dataQuality", {})
    detail_failures = payload.get("counts", {}).get("detailFailures", quality.get("detailFailures", 0))
    complete_sales = quality.get("orderPaginationComplete") is True and detail_failures == 0
    if complete_sales and raw_series:
        first = min(Series(**item).dates[0] for item in raw_series if item.get("dates"))
        last = max(Series(**item).dates[-1] for item in raw_series if item.get("dates"))
        calendar = []
        day = first
        while day <= last:
            calendar.append(day)
            day += timedelta(days=1)
        series = []
        for item in raw_series:
            observed = dict(zip(Series(**item).dates, Series(**item).units))
            series.append(Series(productId=item["productId"], dates=calendar,
                                 units=[observed.get(day, 0.0) for day in calendar],
                                 stockoutFlags=[False] * len(calendar)))
    else:
        series = [Series(**item) for item in raw_series]
    full_daily_series = [item for item in series
                         if len(item.dates) > horizon + 7
                         and all((right - left).days == 1 for left, right in zip(item.dates, item.dates[1:]))]
    daily_series = [item for item in series
                    if len(item.dates) > horizon + 7
                    and sum(value > 0 for value in item.units) >= 14
                    and all((right - left).days == 1 for left, right in zip(item.dates, item.dates[1:]))]
    items = []
    model = "seasonal_naive_v1"
    model_version = "1"
    for offset in range(0, len(daily_series), 2000):
        request = BacktestRequest(horizonDays=horizon, series=daily_series[offset:offset + 2000])
        result = backtest(request)
        model = result.model
        model_version = result.modelVersion
        items.extend(item.model_dump() for item in result.items)
    eligible_ids = {item.productId for item in daily_series}
    blocked_series = []
    raw_by_id = {item["productId"]: item for item in raw_series}
    for item in series:
        if item.productId in eligible_ids:
            continue
        observed_days = len(raw_by_id.get(item.productId, {}).get("dates", []))
        reason = "fewer than 14 observed selling days; intermittent-demand model required"
        blocked_series.append({"productId": item.productId, "status": "BLOCKED", "reason": reason})
    eligible = [item for item in items if item["status"] == "PASS"]
    wapes = [item["wape"] for item in eligible if item["wape"] is not None]
    rolling = []
    for candidate in ("seasonal_naive_v1", "moving_average_7_v1", "croston_sba_v1", "tsb_v1"):
        candidates = daily_series if candidate in ("seasonal_naive_v1", "moving_average_7_v1") else full_daily_series
        rolling.extend(rolling_metrics(item, window, candidate)
                       for window in (7, 14, 28) for item in candidates)
    rolling_summary = []
    for candidate in ("seasonal_naive_v1", "moving_average_7_v1", "croston_sba_v1", "tsb_v1"):
        for window in (7, 14, 28):
            rows = [row for row in rolling if row.get("model") == candidate
                    and row.get("horizonDays") == window and row.get("status") == "PASS"]
            metrics = {name: [row[name] for row in rows if row.get(name) is not None]
                       for name in ("meanWape", "meanMae", "meanBias", "p80Coverage", "p90Coverage")}
            rolling_summary.append({
                "model": candidate,
                "horizonDays": window,
                "aggregation": "macro mean across eligible product series",
                "seriesEvaluated": len(rows),
                "meanWape": sum(metrics["meanWape"]) / len(metrics["meanWape"]) if metrics["meanWape"] else None,
                "meanMae": sum(metrics["meanMae"]) / len(metrics["meanMae"]) if metrics["meanMae"] else None,
                "meanBias": sum(metrics["meanBias"]) / len(metrics["meanBias"]) if metrics["meanBias"] else None,
                "p80Coverage": sum(metrics["p80Coverage"]) / len(metrics["p80Coverage"]) if metrics["p80Coverage"] else None,
                "p90Coverage": sum(metrics["p90Coverage"]) / len(metrics["p90Coverage"]) if metrics["p90Coverage"] else None,
            })
    all_results = items + blocked_series
    source_quality = quality
    readiness_gaps = []
    if source_quality.get("status") != "SALES_ONLY":
        readiness_gaps.append(f"sales snapshot status is {source_quality.get('status', 'UNKNOWN')}")
    if source_quality.get("zeroSalesDays") != "AVAILABLE":
        readiness_gaps.append("zero-sales/open-day calendar unavailable")
    if source_quality.get("stockoutHistory") != "AVAILABLE":
        readiness_gaps.append("historical stockout flags unavailable")
    if source_quality.get("inventoryHistory") != "AVAILABLE":
        readiness_gaps.append("historical inventory unavailable")
    if blocked_series:
        readiness_gaps.append(f"{len(blocked_series)} product series need an intermittent-demand model or more selling history")
    execution_status = "PASS" if all_results and not blocked_series and eligible and all(item["status"] == "PASS" for item in items) else "BLOCKED"
    quality_status = "PASS" if wapes and sum(wapes) / len(wapes) <= 0.30 else "FAIL"
    if readiness_gaps:
        quality_status = "BLOCKED"
    report = {
        "status": execution_status,
        "productionReadiness": "BLOCKED" if readiness_gaps else "READY_FOR_REVIEW",
        "readinessGaps": readiness_gaps,
        "qualityGate": quality_status,
        "qualityGateRule": "mean WAPE <= 0.30; review censored-demand series separately",
        "sourceSnapshot": str(snapshot.relative_to(ROOT)) if snapshot.is_relative_to(ROOT) else str(snapshot),
        "sourceSnapshotSha": source_sha(snapshot),
        "runtimeSha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "model": model,
        "modelVersion": model_version,
        "evaluationMode": "exploratory_zero_fill" if complete_sales else "observed_sales_days_only",
        "observedDateRange": [str(calendar[0]), str(calendar[-1])] if complete_sales and calendar else None,
        "horizonDays": horizon,
        "seriesCount": len(all_results),
        "passCount": len(eligible),
        "blockedCount": len(all_results) - len(eligible),
        "meanWape": sum(wapes) / len(wapes) if wapes else None,
        "rollingSummary": rolling_summary,
        "rollingBacktest": rolling,
        "items": all_results,
        "writeRequests": [],
        "dataSourceMode": "fixed_read_only_snapshot",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
