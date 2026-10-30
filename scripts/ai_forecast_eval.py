"""Run a deterministic, read-only forecast evaluation against a JSON snapshot.

Usage: python scripts/ai_forecast_eval.py [snapshot.json] [report.json]
The snapshot is intentionally a file, never a live Odoo/SKR connection.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from statistics import pstdev

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "forecast-service"))
from app.forecast_engine import backtest, forecast
from app.schemas import BacktestRequest, ForecastPoint, ForecastRequest, Series


def source_sha(snapshot: Path) -> str:
    try:
        return subprocess.check_output(["git", "hash-object", str(snapshot.resolve())], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.SubprocessError):
        return "unavailable"


MODEL_NAMES = ("seasonal_naive_v1", "moving_average_7_v1", "exponential_smoothing_v1", "croston_sba_v1")


def _points(values: list[float], start_date, horizon: int, spread: float = 0.0) -> list[ForecastPoint]:
    return [ForecastPoint(date=start_date, p50=max(0.0, value),
                          p80=max(0.0, value + 0.84 * spread),
                          p90=max(0.0, value + 1.28 * spread))
            for value in values[:horizon]]


def _forecast_points(train: Series, horizon: int, model: str) -> list[ForecastPoint]:
    usable = [max(0.0, float(value)) for index, value in enumerate(train.units)
              if index >= len(train.stockoutFlags) or not train.stockoutFlags[index]]
    if not usable:
        return _points([0.0] * horizon, train.dates[-1], horizon)
    spread = pstdev(usable[-28:]) if len(usable[-28:]) > 1 else 0.0
    if model == "seasonal_naive_v1":
        week = usable[-7:]
        values = (week * ((horizon + len(week) - 1) // len(week)))[:horizon]
    elif model == "moving_average_7_v1":
        values = [sum(usable[-7:]) / len(usable[-7:])] * horizon
    elif model == "exponential_smoothing_v1":
        level = usable[0]
        alpha = 0.30
        for value in usable[1:]:
            level = alpha * value + (1 - alpha) * level
        values = [level] * horizon
    elif model == "croston_sba_v1":
        nonzero = [(index, value) for index, value in enumerate(usable) if value > 0]
        if not nonzero:
            values = [0.0] * horizon
        else:
            demand = sum(value for _, value in nonzero) / len(nonzero)
            intervals = [nonzero[0][0] + 1] + [index - previous for (previous, _), (index, _) in zip(nonzero, nonzero[1:])]
            interval = sum(intervals) / len(intervals)
            values = [0.95 * demand / max(interval, 1.0)] * horizon
    else:
        raise ValueError(f"unsupported evaluation model: {model}")
    return _points(values, train.dates[-1], horizon, spread)


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
        points = _forecast_points(train, horizon, model)
        target = list(zip(points, series.units[end:end + horizon],
                          series.stockoutFlags[end:end + horizon] or [False] * horizon))
        observed = [(point, max(0.0, float(value))) for point, value, censored in target if not censored]
        censored_days = sum(1 for _, _, censored in target if censored)
        if not observed:
            windows.append({"status": "BLOCKED", "observedDays": 0,
                            "evaluationCensoredDays": censored_days, "censored": True,
                            "wape": None, "mae": None, "bias": None,
                            "p80Coverage": None, "p90Coverage": None})
            continue
        actual = [value for _, value in observed]
        errors = [point.p50 - value for point, value in observed]
        denominator = sum(actual)
        windows.append({
            "status": "PASS",
            "observedDays": len(observed),
            "evaluationCensoredDays": censored_days,
            "wape": sum(abs(error) for error in errors) / denominator if denominator else None,
            "absoluteError": sum(abs(error) for error in errors),
            "actualTotal": denominator,
            "mae": sum(abs(error) for error in errors) / len(errors),
            "bias": sum(errors) / len(errors),
            "p80Coverage": sum(value <= point.p80 for point, value in observed) / len(observed),
            "p90Coverage": sum(value <= point.p90 for point, value in observed) / len(observed),
            "censored": any(series.stockoutFlags[end:end + horizon]) or any(series.stockoutFlags[:end]),
        })
    if not windows:
        return {"productId": series.productId, "horizonDays": horizon, "status": "BLOCKED"}
    numeric = lambda name: [row[name] for row in windows if row[name] is not None]
    evaluated = [row for row in windows if row["status"] == "PASS"]
    mean = lambda name: sum(numeric(name)) / len(numeric(name)) if numeric(name) else None
    actual_total = sum(row["actualTotal"] for row in windows if row.get("actualTotal") is not None)
    absolute_error = sum(row["absoluteError"] for row in windows if row.get("absoluteError") is not None)
    return {
        "productId": series.productId,
        "horizonDays": horizon,
        "model": model,
        "status": "BLOCKED" if not evaluated else "PASS" if len(evaluated) == len(windows) else "PARTIAL",
        "windowCount": len(windows),
        "evaluatedWindowCount": len(evaluated),
        "blockedWindowCount": len(windows) - len(evaluated),
        "meanWape": mean("wape"),
        "weightedWape": absolute_error / actual_total if actual_total else None,
        "absoluteError": absolute_error,
        "actualTotal": actual_total,
        "meanMae": mean("mae"),
        "meanBias": mean("bias"),
        "p80Coverage": mean("p80Coverage"),
        "p90Coverage": mean("p90Coverage"),
        "censoredWindowCount": sum(1 for row in windows if row["censored"]),
    }


def _group_labels(series: Series) -> dict[str, str]:
    flags = series.stockoutFlags or [False] * len(series.units)
    ratio = sum(flags) / len(series.units) if series.units else 0.0
    average = sum(max(0.0, float(value)) for value in series.units) / len(series.units) if series.units else 0.0
    return {
        "category": str(getattr(series, "category", None) or "UNKNOWN"),
        "stockoutRatio": "NONE" if ratio == 0 else "LOW_1_10" if ratio <= 0.10 else "HIGH_GT_10",
        "volume": "LOW_LE_2" if average <= 2 else "MEDIUM_2_10" if average <= 10 else "HIGH_GT_10",
    }


def _aggregate_group(rows: list[dict]) -> dict:
    def avg(name):
        values = [row[name] for row in rows if row.get(name) is not None]
        return sum(values) / len(values) if values else None
    actual_total = sum(row.get("actualTotal", 0) for row in rows)
    absolute_error = sum(row.get("absoluteError", 0) for row in rows)
    return {"seriesCount": len(rows), "evaluatedSeriesCount": sum(row["status"] != "BLOCKED" for row in rows),
            "meanWape": avg("meanWape"), "meanMae": avg("meanMae"), "meanBias": avg("meanBias"),
            "weightedWape": absolute_error / actual_total if actual_total else None,
            "p80Coverage": avg("p80Coverage"), "p90Coverage": avg("p90Coverage")}


def main() -> int:
    snapshot = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "forecast-service" / "fixtures" / "skr-snapshot-demo.json"
    report_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "reports" / "ai-forecast-eval.json"
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    request = BacktestRequest(horizonDays=payload.get("horizonDays", 7), series=[Series(**item) for item in payload["series"]])
    result = backtest(request)
    items = [item.model_dump() for item in result.items]
    eligible = [item for item in items if item["status"] == "PASS"]
    wapes = [item["wape"] for item in eligible if item["wape"] is not None]
    rolling = [rolling_metrics(series, horizon, model)
               for model in MODEL_NAMES
               for horizon in (7, 14, 28) for series in request.series]
    comparison = []
    for model in MODEL_NAMES:
        rows = [rolling_metrics(series, 7, model) for series in request.series]
        for labels in ("category", "stockoutRatio", "volume"):
            groups = {}
            for series, row in zip(request.series, rows):
                key = _group_labels(series)[labels]
                groups.setdefault(key, []).append(row)
            comparison.append({"model": model, "groupBy": labels,
                               "groups": {key: _aggregate_group(value) for key, value in groups.items()}})
    execution_status = "PASS" if eligible and all(item["status"] == "PASS" for item in items) else "BLOCKED"
    report = {
        "status": execution_status,
        "qualityGate": "PASS" if wapes and sum(wapes) / len(wapes) <= 0.30 else "FAIL",
        "qualityGateRule": "mean WAPE <= 0.30; review censored-demand series separately",
        "sourceSnapshot": str(snapshot.resolve().relative_to(ROOT.resolve()))
        if snapshot.resolve().is_relative_to(ROOT.resolve()) else snapshot.name,
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
        "modelComparison": comparison,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
