"""Run a deterministic, read-only forecast evaluation against a JSON snapshot.

Usage: python scripts/ai_forecast_eval.py [snapshot.json] [report.json]
The snapshot is intentionally a file, never a live Odoo/SKR connection.
"""
from __future__ import annotations

import json
import subprocess
import sys
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
            "p80Coverage": sum(value <= point.p80 for point, value in comparable) / len(actual),
            "p90Coverage": sum(value <= point.p90 for point, value in comparable) / len(actual),
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
        "p80Coverage": sum(numeric("p80Coverage")) / len(numeric("p80Coverage")),
        "p90Coverage": sum(numeric("p90Coverage")) / len(numeric("p90Coverage")),
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
    request = BacktestRequest(horizonDays=payload.get("horizonDays", 7), series=[Series(**item) for item in payload["series"]])
    result = backtest(request)
    items = [item.model_dump() for item in result.items]
    eligible = [item for item in items if item["status"] == "PASS"]
    wapes = [item["wape"] for item in eligible if item["wape"] is not None]
    rolling = [rolling_metrics(series, horizon, model)
               for model in ("seasonal_naive_v1", "moving_average_7_v1")
               for horizon in (7, 14, 28) for series in request.series]
    execution_status = "PASS" if eligible and all(item["status"] == "PASS" for item in items) else "BLOCKED"
    report = {
        "status": execution_status,
        "qualityGate": "PASS" if wapes and sum(wapes) / len(wapes) <= 0.30 else "FAIL",
        "qualityGateRule": "mean WAPE <= 0.30; review censored-demand series separately",
        "sourceSnapshot": str(snapshot.relative_to(ROOT)) if snapshot.is_relative_to(ROOT) else str(snapshot),
        "sourceSnapshotSha": source_sha(snapshot),
        "runtimeSha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "model": result.model,
        "modelVersion": result.modelVersion,
        "horizonDays": request.horizonDays,
        "seriesCount": len(items),
        "passCount": len(eligible),
        "blockedCount": len(items) - len(eligible),
        "meanWape": sum(wapes) / len(wapes) if wapes else None,
        "rollingBacktest": rolling,
        "items": items,
        "writeRequests": [],
        "dataSourceMode": "fixed_read_only_snapshot",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
