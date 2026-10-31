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


MODEL_NAMES = ("seasonal_naive_v1", "moving_average_7_v1", "exponential_smoothing_v1", "croston_sba_v1", "tsb_v1")


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
    elif model == "tsb_v1":
        # Teunter-Syntetos-Babai: update demand size and occurrence
        # probability separately, which decays stale intermittent demand.
        nonzero = [value for value in usable if value > 0]
        if not nonzero:
            values = [0.0] * horizon
        else:
            demand = nonzero[0]
            probability = 1.0 if usable[0] > 0 else 0.0
            alpha_demand, alpha_probability = 0.20, 0.20
            for value in usable[1:]:
                occurrence = 1.0 if value > 0 else 0.0
                probability = alpha_probability * occurrence + (1 - alpha_probability) * probability
                if value > 0:
                    demand = alpha_demand * value + (1 - alpha_demand) * demand
            values = [probability * demand] * horizon
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
                            "p80Coverage": None, "p90Coverage": None,
                            "underForecastUnits": None, "overForecastUnits": None,
                            "p50DemandCoverage": None})
            continue
        actual = [value for _, value in observed]
        errors = [point.p50 - value for point, value in observed]
        under_forecast = sum(max(value - point.p50, 0.0) for point, value in observed)
        over_forecast = sum(max(point.p50 - value, 0.0) for point, value in observed)
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
            "underForecastUnits": under_forecast,
            "overForecastUnits": over_forecast,
            "p50DemandCoverage": sum(value <= point.p50 for point, value in observed) / len(observed),
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
        "underForecastUnits": sum(row.get("underForecastUnits") or 0 for row in windows),
        "overForecastUnits": sum(row.get("overForecastUnits") or 0 for row in windows),
        "p50DemandCoverage": mean("p50DemandCoverage"),
        "evaluationCensoredDays": sum(row.get("evaluationCensoredDays", 0) for row in windows),
        "censoredWindowCount": sum(1 for row in windows if row["censored"]),
    }


def select_model(series: Series, horizon: int = 7) -> dict:
    """Choose a model for one product from rolling, uncensored backtests.

    The selector is deliberately metric-driven.  A blocked or fully censored
    candidate cannot win; among the remaining candidates weighted WAPE is the
    primary objective, with a small absolute-bias tie breaker.  The demand
    profile is returned as an explanation for the decision, not as a hidden
    rule that overrides measured backtest performance.
    """
    rows = [rolling_metrics(series, horizon, model) for model in MODEL_NAMES]
    eligible = [row for row in rows if row.get("status") != "BLOCKED" and row.get("weightedWape") is not None]
    if not eligible:
        return {
            "productId": series.productId, "horizonDays": horizon,
            "selectedModel": None, "selectionStatus": "BLOCKED",
            "profile": _demand_profile(series), "candidates": rows,
        }
    winner = min(eligible, key=lambda row: (
        row["weightedWape"], abs(row.get("meanBias") or 0.0), row["model"]))
    return {
        "productId": series.productId, "horizonDays": horizon,
        "selectedModel": winner["model"], "selectionStatus": "PASS",
        "profile": _demand_profile(series),
        "selectionMetric": "weightedWape_then_absolute_bias",
        "selectedMetrics": {name: winner.get(name) for name in
                            ("weightedWape", "meanWape", "meanMae", "meanBias", "p80Coverage", "p90Coverage")},
        "candidates": rows,
    }


def _demand_profile(series: Series) -> str:
    values = [max(0.0, float(value)) for value in series.units]
    if not values:
        return "NO_HISTORY"
    zero_ratio = sum(value == 0 for value in values) / len(values)
    average = sum(values) / len(values)
    if zero_ratio >= 0.70:
        return "INTERMITTENT_OR_LOW_VOLUME"
    if average > 10 and zero_ratio <= 0.10:
        return "HIGH_VOLUME_STABLE"
    if len(values) >= 14:
        weekly = sum(abs(values[index] - values[index - 7]) for index in range(7, len(values)))
        baseline = sum(values[7:]) or 1.0
        if weekly / baseline < 0.45:
            return "WEEKLY_PATTERN_CANDIDATE"
    return "GENERAL"


def _group_labels(series: Series) -> dict[str, str]:
    if series.stockoutDataQuality and series.stockoutDataQuality not in ("VALID", "INFERRED_FROM_STOCK_MOVES"):
        stockout_label = "UNKNOWN"
    else:
        stockout_label = None
    flags = series.stockoutFlags or [False] * len(series.units)
    ratio = sum(flags) / len(series.units) if series.units else 0.0
    average = sum(max(0.0, float(value)) for value in series.units) / len(series.units) if series.units else 0.0
    return {
        "category": str(getattr(series, "category", None) or "UNKNOWN"),
        "stockoutRatio": stockout_label or ("NONE" if ratio == 0 else "LOW_1_10" if ratio <= 0.10 else "HIGH_GT_10"),
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
            "p80Coverage": avg("p80Coverage"), "p90Coverage": avg("p90Coverage"),
            "p50DemandCoverage": avg("p50DemandCoverage"),
            "underForecastUnits": sum(row.get("underForecastUnits") or 0 for row in rows),
            "overForecastUnits": sum(row.get("overForecastUnits") or 0 for row in rows),
            "evaluationCensoredDays": sum(row.get("evaluationCensoredDays", 0) for row in rows)}


def _business_metrics(rows: list[dict], cost_model: dict | None = None) -> dict:
    """Return decision metrics without inventing financial assumptions.

    The unit proxies are always measurable from a sales backtest. Currency
    values remain ``None`` until the merchant supplies costs in the snapshot.
    """
    under = sum(row.get("underForecastUnits") or 0 for row in rows)
    over = sum(row.get("overForecastUnits") or 0 for row in rows)
    censored_days = sum(row.get("evaluationCensoredDays", 0) for row in rows)
    observed_days = sum(row.get("evaluatedWindowCount", 0) for row in rows)
    costs = cost_model or {}
    stockout_rate = censored_days / (censored_days + observed_days) if censored_days + observed_days else None
    return {
        "status": "CONFIGURED" if {"stockoutCostPerUnit", "holdingCostPerUnitDay"} <= costs.keys() else "COST_CONFIG_REQUIRED",
        "stockoutLoss": under * float(costs["stockoutCostPerUnit"]) if "stockoutCostPerUnit" in costs else None,
        "holdingCost": over * float(costs["holdingCostPerUnitDay"]) if "holdingCostPerUnitDay" in costs else None,
        "expiryRisk": over * float(costs["expiryRiskPerUnit"]) if "expiryRiskPerUnit" in costs else None,
        "stockoutUnitProxy": under,
        "overstockUnitProxy": over,
        "censoredDemandRate": stockout_rate,
        "costModelSource": "snapshot.costModel" if costs else None,
    }


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
    model_selections = [select_model(series, 7) for series in request.series]
    selected_counts = {}
    for selection in model_selections:
        model = selection.get("selectedModel") or "BLOCKED"
        selected_counts[model] = selected_counts.get(model, 0) + 1
    selected_rolling = [
        rolling_metrics(series, 7, selection["selectedModel"])
        for series, selection in zip(request.series, model_selections)
        if selection.get("selectedModel")
    ]
    comparison = []
    for model in MODEL_NAMES:
        for horizon in (7, 14, 28):
            rows = [rolling_metrics(series, horizon, model) for series in request.series]
            for labels in ("category", "stockoutRatio", "volume"):
                groups = {}
                for series, row in zip(request.series, rows):
                    key = _group_labels(series)[labels]
                    groups.setdefault(key, []).append(row)
                comparison.append({"model": model, "horizonDays": horizon, "groupBy": labels,
                                   "groups": {key: _aggregate_group(value) for key, value in groups.items()}})
    execution_status = "PASS" if eligible and all(item["status"] == "PASS" for item in items) else "BLOCKED"
    business_metrics = _business_metrics(selected_rolling, payload.get("costModel"))
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
        "modelSelection": model_selections,
        "modelSelectionSummary": {
            "horizonDays": 7,
            "method": "per_product_rolling_backtest",
            "metric": "weightedWape_then_absolute_bias",
            "selectedModelCounts": selected_counts,
        },
        "businessMetrics": business_metrics,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
