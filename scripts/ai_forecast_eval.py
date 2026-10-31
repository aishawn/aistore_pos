"""Run a deterministic, read-only forecast evaluation against a JSON snapshot.

Usage: python scripts/ai_forecast_eval.py [snapshot.json] [report.json] [inventory-history.json]
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


MODEL_NAMES = ("seasonal_naive_v1", "moving_average_7_v1", "exponential_smoothing_v1", "croston_sba_v1", "tsb_v1", "two_stage_occurrence_v1")


def apply_inventory_history(series: Series, history: dict) -> Series:
    """Apply complete historical stock observations, retaining their provenance."""
    if history.get("qualityWarnings") or str(history.get("backtestReadiness", "")).startswith("BLOCKED"):
        return series
    products = {str(item.get("productId")): item for item in history.get("products", [])}
    product = products.get(str(series.productId))
    observations = {str(item.get("date")): item for item in (product or {}).get("observations", [])}
    expected_dates = [value.isoformat() for value in series.dates]
    if not observations:
        return series
    if not all(value in observations for value in expected_dates):
        return series.model_copy(update={"stockoutDataQuality": "HISTORICAL_INVENTORY_INCOMPLETE"})
    source_quality = history.get("dataQuality")
    quality = {
        "NATIVE_ODOO_DAILY_SNAPSHOTS": "NATIVE_ODOO_DAILY_SNAPSHOTS",
        "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE": "RECONSTRUCTED_FROM_ODOO_TO_DATE",
    }.get(source_quality, "HISTORICAL_INVENTORY_UNVERIFIED")
    return series.model_copy(update={
        "stockoutFlags": [bool(observations[value].get("isStockout")) for value in expected_dates],
        "stockoutDataQuality": quality,
    })


# Kept for callers and tests written before historical Odoo queries were added.
apply_native_inventory_history = apply_inventory_history


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
    elif model == "two_stage_occurrence_v1":
        nonzero = [value for value in usable if value > 0]
        probability = len(nonzero) / len(usable) if usable else 0.0
        amount = sum(nonzero) / len(nonzero) if nonzero else 0.0
        values = [probability * amount] * horizon
    else:
        raise ValueError(f"unsupported evaluation model: {model}")
    return _points(values, train.dates[-1], horizon, spread)


def rolling_metrics(series: Series, horizon: int, model: str = "seasonal_naive_v1",
                    cost_model: dict | None = None) -> dict:
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
        window = {
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
        }
        if cost_model and {"stockoutCostPerUnit", "holdingCostPerUnitDay"} <= cost_model.keys():
            window["businessCost"] = (
                under_forecast * float(cost_model["stockoutCostPerUnit"])
                + over_forecast * float(cost_model["holdingCostPerUnitDay"])
                + over_forecast * float(cost_model.get("expiryRiskPerUnit", 0))
            )
        else:
            window["businessCost"] = None
        windows.append(window)
    if not windows:
        return {"productId": series.productId, "horizonDays": horizon, "status": "BLOCKED"}
    numeric = lambda name: [row[name] for row in windows if row[name] is not None]
    evaluated = [row for row in windows if row["status"] == "PASS"]
    mean = lambda name: sum(numeric(name)) / len(numeric(name)) if numeric(name) else None
    actual_total = sum(row["actualTotal"] for row in windows if row.get("actualTotal") is not None)
    absolute_error = sum(row["absoluteError"] for row in windows if row.get("absoluteError") is not None)
    business_costs = [row["businessCost"] for row in windows if row.get("businessCost") is not None]
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
        "businessCost": sum(business_costs) if business_costs else None,
    }


def select_model(series: Series, horizon: int = 7, cost_model: dict | None = None,
                 candidate_rows: list[dict] | None = None) -> dict:
    """Choose a model for one product from rolling, uncensored backtests.

    The selector is deliberately metric-driven.  A blocked or fully censored
    candidate cannot win; among the remaining candidates weighted WAPE is the
    primary objective, with a small absolute-bias tie breaker.  The demand
    profile is returned as an explanation for the decision, not as a hidden
    rule that overrides measured backtest performance.
    """
    rows = candidate_rows or [rolling_metrics(series, horizon, model, cost_model) for model in MODEL_NAMES]
    eligible = [row for row in rows if row.get("status") != "BLOCKED" and row.get("weightedWape") is not None]
    if not eligible:
        return {
            "productId": series.productId, "horizonDays": horizon,
            "selectedModel": None, "selectionStatus": "BLOCKED",
            "profile": _demand_profile(series), "candidates": rows,
        }
    cost_configured = cost_model and {"stockoutCostPerUnit", "holdingCostPerUnitDay"} <= cost_model.keys()
    if cost_configured and any(row.get("businessCost") is not None for row in eligible):
        winner = min(eligible, key=lambda row: (
            row.get("businessCost", float("inf")), abs(row.get("meanBias") or 0.0), row["model"]))
        selection_metric = "business_cost_then_absolute_bias"
    else:
        winner = min(eligible, key=lambda row: (
            row["weightedWape"], abs(row.get("meanBias") or 0.0), row["model"]))
        selection_metric = "weightedWape_then_absolute_bias"
    return {
        "productId": series.productId, "horizonDays": horizon,
        "selectedModel": winner["model"], "selectionStatus": "PASS",
        "profile": _demand_profile(series),
        "selectionMetric": selection_metric,
        "selectedMetrics": {name: winner.get(name) for name in
                            ("businessCost", "weightedWape", "meanWape", "meanMae", "meanBias", "p80Coverage", "p90Coverage")},
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
    if average <= 2:
        return "LOW_VOLUME"
    if len(values) >= 21:
        lag7_error = sum(abs(values[index] - values[index - 7])
                         for index in range(7, len(values))) / (len(values) - 7)
        mean_level = average or 1.0
        mean_error = sum(abs(value - mean_level) for value in values) / len(values)
        # A weekly profile is meaningful only when the 7-day lag predicts
        # better than a flat baseline; a constant series is therefore stable,
        # not incorrectly labelled seasonal.
        if lag7_error < mean_error * 0.70:
            return "WEEKLY_PATTERN_CANDIDATE"
    return "GENERAL"


def _similarity_score(target: Series, peer: Series) -> int:
    """Score only declared product metadata; never compare product IDs."""
    score = 0
    if target.category and target.category == peer.category:
        score += 4
    if target.brand and target.brand == peer.brand:
        score += 3
    if target.priceBand and target.priceBand == peer.priceBand:
        score += 2
    return score


def cold_start_similarity(target: Series, peers: list[Series], horizon: int = 7) -> dict:
    """Build an explainable cold-start forecast from mature similar products."""
    if len(target.units) >= 14 and not target.isNew:
        return {"productId": target.productId, "status": "NOT_NEEDED", "matches": []}
    candidates = [peer for peer in peers if peer.productId != target.productId and len(peer.units) >= 14
                  and _similarity_score(target, peer) > 0]
    ranked = sorted(candidates, key=lambda peer: (_similarity_score(target, peer), sum(peer.units)), reverse=True)
    selected = ranked[:5]
    if not selected:
        return {"productId": target.productId, "status": "BLOCKED", "matches": [],
                "reason": "no_mature_product_with_matching_category_brand_or_price_band"}
    forecasts = []
    for peer in selected:
        usable = [max(0.0, float(value)) for index, value in enumerate(peer.units)
                  if not peer.stockoutFlags or not peer.stockoutFlags[index]]
        forecasts.append(sum(usable[-7:]) / len(usable[-7:]) if usable else 0.0)
    baseline = sum(forecasts) / len(forecasts)
    return {"productId": target.productId, "status": "PASS", "model": "cold_start_similarity_v1",
            "forecast": [round(baseline, 4)] * horizon,
            "matches": [{"productId": peer.productId, "score": _similarity_score(target, peer),
                         "category": peer.category, "brand": peer.brand, "priceBand": peer.priceBand}
                        for peer in selected],
            "dataQuality": "INFERRED_FROM_SIMILAR_PRODUCTS"}


def _group_labels(series: Series) -> dict[str, str]:
    if series.stockoutDataQuality and series.stockoutDataQuality not in (
        "VALID", "INFERRED_FROM_STOCK_MOVES", "RECONSTRUCTED_FROM_ODOO_TO_DATE",
        "NATIVE_ODOO_DAILY_SNAPSHOTS",
    ):
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
            "businessCost": sum(row.get("businessCost") or 0 for row in rows) if any(row.get("businessCost") is not None for row in rows) else None,
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
    actual_units = sum(row.get("actualTotal") or 0 for row in rows)
    service_level = max(0.0, 1.0 - under / actual_units) if actual_units else None
    return {
        "status": "CONFIGURED" if {"stockoutCostPerUnit", "holdingCostPerUnitDay"} <= costs.keys() else "COST_CONFIG_REQUIRED",
        "stockoutLoss": under * float(costs["stockoutCostPerUnit"]) if "stockoutCostPerUnit" in costs else None,
        "holdingCost": over * float(costs["holdingCostPerUnitDay"]) if "holdingCostPerUnitDay" in costs else None,
        "expiryRisk": over * float(costs["expiryRiskPerUnit"]) if "expiryRiskPerUnit" in costs else None,
        "stockoutUnitProxy": under,
        "overstockUnitProxy": over,
        "censoredDemandRate": stockout_rate,
        "serviceLevel": service_level,
        "serviceLevelDefinition": "1 - under-forecast units / observed units; native inventory is required for fill-rate accuracy",
        "expectedStockoutDaysAfterReplenishment": None,
        "stockoutDaysDataQuality": "REQUIRES_NATIVE_INVENTORY_HISTORY",
        "costModelSource": "snapshot.costModel" if costs else None,
    }


def main() -> int:
    snapshot = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "forecast-service" / "fixtures" / "skr-snapshot-demo.json"
    report_path = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "reports" / "ai-forecast-eval.json"
    payload = json.loads(snapshot.read_text(encoding="utf-8"))
    raw_series = [Series(**item) for item in payload["series"]]
    inventory_history_path = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    inventory_history = None
    if inventory_history_path:
        inventory_history = json.loads(inventory_history_path.read_text(encoding="utf-8"))
        raw_series = [apply_native_inventory_history(series, inventory_history) for series in raw_series]
    request = BacktestRequest(horizonDays=payload.get("horizonDays", 7), series=raw_series)
    result = backtest(request)
    items = [item.model_dump() for item in result.items]
    eligible = [item for item in items if item["status"] == "PASS"]
    wapes = [item["wape"] for item in eligible if item["wape"] is not None]
    cost_model = payload.get("costModel")
    rolling = []
    rolling_by_key = {}
    for model in MODEL_NAMES:
        for horizon in (7, 14, 28):
            for series in request.series:
                row = rolling_metrics(series, horizon, model, cost_model)
                rolling.append(row)
                rolling_by_key[(series.productId, horizon, model)] = row
    model_selections = [
        select_model(series, 7, cost_model,
                     [rolling_by_key[(series.productId, 7, model)] for model in MODEL_NAMES])
        for series in request.series
    ]
    cold_start = [cold_start_similarity(series, request.series, 7) for series in request.series
                  if series.isNew or len(series.units) < 14]
    selected_counts = {}
    for selection in model_selections:
        model = selection.get("selectedModel") or "BLOCKED"
        selected_counts[model] = selected_counts.get(model, 0) + 1
    selected_rolling = [
        rolling_by_key[(series.productId, 7, selection["selectedModel"])]
        for series, selection in zip(request.series, model_selections)
        if selection.get("selectedModel")
    ]
    comparison = []
    for model in MODEL_NAMES:
        for horizon in (7, 14, 28):
            rows = [rolling_by_key[(series.productId, horizon, model)] for series in request.series]
            for labels in ("category", "stockoutRatio", "volume"):
                groups = {}
                for series, row in zip(request.series, rows):
                    key = _group_labels(series)[labels]
                    groups.setdefault(key, []).append(row)
                comparison.append({"model": model, "horizonDays": horizon, "groupBy": labels,
                                   "groups": {key: _aggregate_group(value) for key, value in groups.items()}})
    inventory_rejected = bool(inventory_history and (
        inventory_history.get("qualityWarnings")
        or str(inventory_history.get("backtestReadiness", "")).startswith("BLOCKED")
    ))
    execution_status = "PASS" if eligible and all(item["status"] == "PASS" for item in items) and not inventory_rejected else "BLOCKED"
    business_metrics = _business_metrics(selected_rolling, cost_model)
    report = {
        "status": execution_status,
        "qualityGate": "BLOCKED" if inventory_rejected else "PASS" if wapes and sum(wapes) / len(wapes) <= 0.30 else "FAIL",
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
            "metric": "business_cost_then_absolute_bias" if cost_model and {"stockoutCostPerUnit", "holdingCostPerUnitDay"} <= cost_model.keys() else "weightedWape_then_absolute_bias",
            "selectedModelCounts": selected_counts,
        },
        "businessMetrics": business_metrics,
        "coldStartSimilarity": cold_start,
        "inventoryHistory": {
            "status": "REJECTED_QUALITY_GATE" if inventory_rejected else "APPLIED" if inventory_history else "NOT_PROVIDED",
            "path": str(inventory_history_path) if inventory_history_path else None,
            "dataQuality": inventory_history.get("dataQuality") if inventory_history else None,
            "backtestReadiness": inventory_history.get("backtestReadiness") if inventory_history else None,
            "nativeSnapshotAcceptanceReadiness": inventory_history.get("nativeSnapshotAcceptanceReadiness") if inventory_history else None,
            "researchOnly": bool(inventory_history and inventory_history.get("dataQuality") == "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE"),
            "inventoryConsistencyStatus": inventory_history.get("inventoryConsistencyStatus") if inventory_history else None,
            "qualityWarnings": inventory_history.get("qualityWarnings", []) if inventory_history else [],
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
