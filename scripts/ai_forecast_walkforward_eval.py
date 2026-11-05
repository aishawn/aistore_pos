"""Leakage-aware walk-forward evaluation using fixed read-only snapshots."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "forecast-service"))

from app.forecast_engine import MODEL_NAMES, forecast as run_forecast
from app.schemas import ForecastRequest, Series
from scripts.ai_forecast_eval import apply_inventory_history, require_native_inventory_event_times


# Keep every deterministic candidate in the offline comparison. Production
# selection remains governed by forecast_engine.py; this report is intended to
# show whether intermittent-demand models actually beat the current baseline.
BASELINE_MODELS = tuple(MODEL_NAMES)
ACCEPTED_INVENTORY_QUALITY = {"NATIVE_ODOO_DAILY_SNAPSHOTS"}


def walk_forward_origins(observation_count: int, horizon: int,
                         minimum_train_days: int = 28) -> list[int]:
    if observation_count < 1 or horizon < 1 or minimum_train_days < 1:
        raise ValueError("observation_count, horizon, and minimum_train_days must be positive")
    return list(range(minimum_train_days, observation_count - horizon + 1, horizon))


def _forecast_request(series: list[Series], vendor_id: int, outlet_id: int,
                      horizon: int, forecast_start_date) -> ForecastRequest:
    return ForecastRequest(
        vendorId=max(1, vendor_id), outletId=max(1, outlet_id),
        horizonDays=horizon, forecastStartDate=forecast_start_date,
        sourceVersion="read_only_walk_forward_research_v1", series=series,
    )


def _score_fold(metrics: dict, scored_product_ids: set[int], actual_series: Series,
                forecast_item, origin: int, horizon: int,
                closed_dates: set | None = None) -> None:
    closed_dates = closed_dates or set()
    points = forecast_item.forecast[:horizon]
    if len(points) != horizon:
        raise ValueError(
            f"forecast for product {actual_series.productId} returned {len(points)} points; expected {horizon}"
        )
    observed = 0
    predicted_total = 0.0
    actual_total = 0.0
    # MASE uses only the training prefix at this forecast origin.  A missing
    # or constant prefix has no meaningful scale, so that product window is
    # excluded from the aggregate MASE denominator rather than treated as a
    # zero-error series.
    training_values = [
        max(0.0, float(value))
        for index, value in enumerate(actual_series.units[:origin])
        if actual_series.dates[index] not in closed_dates
        and (index >= len(actual_series.stockoutFlags) or not actual_series.stockoutFlags[index])
    ]
    mase_scale = (
        sum(abs(right - left) for left, right in zip(training_values, training_values[1:]))
        / (len(training_values) - 1)
        if len(training_values) > 1 else None
    )
    for offset, point in enumerate(points):
        index = origin + offset
        if index >= len(actual_series.units):
            break
        if actual_series.dates[index] in closed_dates:
            metrics["closedDaysExcluded"] += 1
            continue
        if index < len(actual_series.stockoutFlags) and actual_series.stockoutFlags[index]:
            metrics["censoredDays"] += 1
            continue
        actual = max(0.0, float(actual_series.units[index]))
        error = float(point.p50) - actual
        metrics["observedDays"] += 1
        metrics["actualUnits"] += actual
        metrics["absoluteError"] += abs(error)
        metrics["signedError"] += error
        if mase_scale is not None and mase_scale > 0:
            metrics["maseNumerator"] += abs(error)
            metrics["maseDenominator"] += mase_scale
        metrics["p80CoveredDays"] += int(actual <= point.p80)
        metrics["p90CoveredDays"] += int(actual <= point.p90)
        predicted_total += float(point.p50)
        actual_total += actual
        observed += 1
    if observed:
        scored_product_ids.add(actual_series.productId)
        metrics["horizonWindows"] += 1
        metrics["horizonAbsoluteError"] += abs(predicted_total - actual_total)
        metrics["horizonActualUnits"] += actual_total
        metrics["zeroDemandHorizonWindows"] += int(actual_total == 0)


def _metric_summary(metrics: dict, scored_product_ids: set[int],
                    expected_product_ids: set[int] | None = None) -> dict:
    actual = metrics["actualUnits"]
    days = metrics["observedDays"]
    return {
        "status": "PASS" if days and actual > 0 else "BLOCKED_NO_SCORABLE_DEMAND",
        "expectedSkuCount": (len(expected_product_ids) if expected_product_ids is not None else None),
        "scoredProducts": len(scored_product_ids),
        "skuCoverage": (len(scored_product_ids) / len(expected_product_ids)
                        if expected_product_ids else None),
        "observedDays": days,
        "censoredDaysExcluded": metrics["censoredDays"],
        "closedDaysExcluded": metrics["closedDaysExcluded"],
        "actualUnits": round(actual, 4),
        "absoluteErrorUnits": round(metrics["absoluteError"], 4),
        "weightedWape": metrics["absoluteError"] / actual if actual > 0 else None,
        "biasRatio": metrics["signedError"] / actual if actual > 0 else None,
        "horizonTotalWape": (metrics["horizonAbsoluteError"] / metrics["horizonActualUnits"]
                             if metrics["horizonActualUnits"] > 0 else None),
        "evaluatedProductWindows": metrics["horizonWindows"],
        "zeroDemandProductWindows": metrics["zeroDemandHorizonWindows"],
        "maePerObservedDay": metrics["absoluteError"] / days if days else None,
        "mase": (metrics["maseNumerator"] / metrics["maseDenominator"]
                 if metrics["maseDenominator"] > 0 else None),
        "biasUnits": round(metrics["signedError"], 4),
        "p80Coverage": metrics["p80CoveredDays"] / days if days else None,
        "p90Coverage": metrics["p90CoveredDays"] / days if days else None,
    }


def _demand_segment(series: Series, training_days: int,
                    closed_dates: set | None = None) -> str:
    closed_dates = closed_dates or set()
    observed = [
        max(0.0, float(value))
        for index, value in enumerate(series.units[:training_days])
        if series.dates[index] not in closed_dates
        and (index >= len(series.stockoutFlags) or not series.stockoutFlags[index])
    ]
    if not observed or not any(observed):
        return "NO_DEMAND_TRAIN"
    occurrence = sum(value > 0 for value in observed) / len(observed)
    if occurrence <= 0.10:
        return "SPARSE"
    if occurrence <= 0.40:
        return "INTERMITTENT"
    return "REGULAR"


def evaluate(sales: dict, inventory: dict | None, horizons: list[int],
             minimum_train_days: int = 28,
             closed_dates: set | None = None) -> dict:
    if sales.get("writeRequests", []) != [] or (inventory is not None and inventory.get("writeRequests", []) != []):
        raise ValueError("evaluation snapshots must have empty writeRequests")
    if inventory is not None:
        require_native_inventory_event_times(inventory)
    if inventory is not None and any(item.get("productId") is None for item in inventory.get("qualityWarnings", [])):
        raise ValueError("global inventory quality warning blocks stockout-aware evaluation")

    warning_ids = {
        int(item["productId"])
        for item in (inventory or {}).get("qualityWarnings", [])
        if item.get("productId") is not None
    }
    raw_series = [Series(**item) for item in sales.get("series", [])]
    if not raw_series:
        raise ValueError("sales snapshot has no product series")
    shared_dates = raw_series[0].dates
    closed_dates = closed_dates or set()
    if any(item.dates != shared_dates for item in raw_series):
        raise ValueError("all product series must share the same daily date range")
    if inventory is None and any(item.stockoutFlags for item in raw_series):
        raise ValueError("sales-only evaluation requires empty stockoutFlags; provide validated inventory history instead")
    applied = ([apply_inventory_history(item, inventory) for item in raw_series]
               if inventory is not None else raw_series)
    known_series = list(applied) if inventory is None else []
    excluded_warning_count = 0
    excluded_unknown_count = 0
    if inventory is not None:
        for item in applied:
            if item.productId in warning_ids:
                excluded_warning_count += 1
            elif (item.stockoutDataQuality in ("EXCLUDED_SUSPECT_HISTORICAL_INVENTORY", "HISTORICAL_INVENTORY_INCOMPLETE")
                  or len(item.stockoutFlags) != len(item.units)):
                excluded_unknown_count += 1
            else:
                known_series.append(item)
    if not known_series:
        return _blocked_inventory_report(
            sales, inventory, raw_series, horizons, excluded_warning_count,
            excluded_unknown_count,
        )

    vendor_id = int(sales.get("companyId") or 1)
    outlet_id = int(sales.get("outletId") or vendor_id)
    results = []
    for horizon in horizons:
        methods = {"selected": {"metrics": Counter(), "products": set(), "models": Counter()},
                   **{model: {"metrics": Counter(), "products": set()} for model in BASELINE_MODELS}}
        segment_methods = {}
        segment_expected_products = {}
        folds = []
        fold_metrics = []
        origins = walk_forward_origins(len(shared_dates), horizon, minimum_train_days)
        for origin in origins:
            train_series = [series.model_copy(update={
                "dates": series.dates[:origin], "units": series.units[:origin],
                "stockoutFlags": [
                    (index < len(series.stockoutFlags) and series.stockoutFlags[index])
                    or day in closed_dates
                    for index, day in enumerate(series.dates[:origin])
                ], "selectedModel": None,
                "unitCost": None, "unitPrice": None,
            }) for series in known_series]
            test_start = shared_dates[origin]
            start_date = test_start - timedelta(days=1)
            selected_response = run_forecast(_forecast_request(
                train_series, vendor_id, outlet_id, horizon, start_date,
            ))
            predictions = {item.productId: item for item in selected_response.items}
            baseline_predictions = {}
            for model in BASELINE_MODELS:
                explicit = [item.model_copy(update={"selectedModel": model}) for item in train_series]
                response = run_forecast(_forecast_request(explicit, vendor_id, outlet_id, horizon, start_date))
                baseline_predictions[model] = {item.productId: item for item in response.items}
            fold_methods = {method: {"metrics": Counter(), "products": set(), "models": Counter()}
                            for method in methods}
            fold_segments = {}
            fold_segment_expected = {}
            for series in known_series:
                segment = _demand_segment(series, origin, closed_dates)
                fold_segment_expected.setdefault(segment, set()).add(series.productId)
                segment_expected_products.setdefault(segment, set()).add(series.productId)
                segment_methods.setdefault(segment, {
                    method: {"metrics": Counter(), "products": set(), "models": Counter()}
                    for method in methods
                })
                fold_segments.setdefault(segment, {
                    method: {"metrics": Counter(), "products": set(), "models": Counter()}
                    for method in methods
                })
                selected = predictions[series.productId]
                methods["selected"]["models"][selected.model] += 1
                _score_fold(methods["selected"]["metrics"], methods["selected"]["products"],
                            series, selected, origin, horizon, closed_dates)
                fold_methods["selected"]["models"][selected.model] += 1
                _score_fold(fold_methods["selected"]["metrics"], fold_methods["selected"]["products"],
                            series, selected, origin, horizon, closed_dates)
                segment_methods[segment]["selected"]["models"][selected.model] += 1
                _score_fold(segment_methods[segment]["selected"]["metrics"],
                            segment_methods[segment]["selected"]["products"],
                            series, selected, origin, horizon, closed_dates)
                fold_segments[segment]["selected"]["models"][selected.model] += 1
                _score_fold(fold_segments[segment]["selected"]["metrics"],
                            fold_segments[segment]["selected"]["products"],
                            series, selected, origin, horizon, closed_dates)
                for model in BASELINE_MODELS:
                    _score_fold(methods[model]["metrics"], methods[model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon,
                                closed_dates)
                    _score_fold(fold_methods[model]["metrics"], fold_methods[model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon,
                                closed_dates)
                    _score_fold(segment_methods[segment][model]["metrics"],
                                segment_methods[segment][model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon,
                                closed_dates)
                    _score_fold(fold_segments[segment][model]["metrics"],
                                fold_segments[segment][model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon,
                                closed_dates)
            fold_summary = {
                method: _metric_summary(row["metrics"], row["products"],
                                        {series.productId for series in known_series})
                for method, row in fold_methods.items()
            }
            fold_summary["selected"]["selectedModelCounts"] = dict(fold_methods["selected"]["models"])
            fold_segment_summary = {}
            for segment, rows in fold_segments.items():
                fold_segment_summary[segment] = {
                    method: _metric_summary(row["metrics"], row["products"],
                                             fold_segment_expected[segment])
                    for method, row in rows.items()
                }
                fold_segment_summary[segment]["selected"]["selectedModelCounts"] = dict(
                    rows["selected"]["models"]
                )
            fold_metrics.append({"metrics": fold_summary,
                                 "metricsByTrainingDemandSegment": fold_segment_summary})
            folds.append({
                "trainEnd": shared_dates[origin - 1].isoformat(),
                "evaluationStart": test_start.isoformat(),
                "evaluationEnd": shared_dates[origin + horizon - 1].isoformat(),
                "trainingDays": origin,
            })
        summaries = {
            method: _metric_summary(row["metrics"], row["products"],
                                    {series.productId for series in known_series})
            for method, row in methods.items()
        }
        for method in methods:
            summaries[method]["foldStability"] = _fold_stability([
                fold["metrics"][method] for fold in fold_metrics
            ])
        for method in BASELINE_MODELS:
            comparable = [fold for fold in fold_metrics
                          if fold["metrics"][method]["weightedWape"] is not None
                          and fold["metrics"]["seasonal_naive_v1"]["weightedWape"] is not None]
            stability = summaries[method]["foldStability"]
            stability["winsVsSeasonalNaive"] = (
                sum(fold["metrics"][method]["weightedWape"] <
                    fold["metrics"]["seasonal_naive_v1"]["weightedWape"] for fold in comparable)
                / len(comparable) if comparable else None
            )
        summaries["selected"]["selectedModelCounts"] = dict(methods["selected"]["models"])
        segment_summaries = {}
        for segment, segment_rows in segment_methods.items():
            expected_ids = segment_expected_products[segment]
            segment_summaries[segment] = {
                method: _metric_summary(row["metrics"], row["products"], expected_ids)
                for method, row in segment_rows.items()
            }
            segment_fold_rows = [fold["metricsByTrainingDemandSegment"][segment]
                                 for fold in fold_metrics
                                 if segment in fold["metricsByTrainingDemandSegment"]]
            for method in segment_rows:
                segment_summaries[segment][method]["foldStability"] = _fold_stability([
                    fold[method] for fold in segment_fold_rows
                ])
                if method in BASELINE_MODELS:
                    comparable = [fold for fold in segment_fold_rows
                                  if fold[method]["weightedWape"] is not None
                                  and fold["seasonal_naive_v1"]["weightedWape"] is not None]
                    segment_summaries[segment][method]["foldStability"]["winsVsSeasonalNaive"] = (
                        sum(fold[method]["weightedWape"] <
                            fold["seasonal_naive_v1"]["weightedWape"] for fold in comparable)
                        / len(comparable) if comparable else None
                    )
            segment_summaries[segment]["selected"]["selectedModelCounts"] = dict(
                segment_rows["selected"]["models"]
            )
        selected_wape = summaries["selected"]["weightedWape"]
        selected_horizon_wape = summaries["selected"]["horizonTotalWape"]
        scored = summaries["selected"]["status"] == "PASS"
        evaluation_status = "SCORED" if origins and scored else "BLOCKED_INSUFFICIENT_EVALUATION_DATA"
        results.append({
            "horizonDays": horizon,
            "evaluationStatus": evaluation_status,
            "walkForwardFoldCount": len(origins),
            "foldScheduleSample": folds,
            "foldMetrics": fold_metrics,
            "modelSelection": "reselect_using_only_each_fold_training_prefix",
            "metrics": summaries,
            "metricsByTrainingDemandSegment": segment_summaries,
            "qualityGate": ("BLOCKED" if not origins or not scored else
                            "PASS" if selected_horizon_wape is not None and selected_horizon_wape <= 0.30 else "FAIL"),
            "qualityGateRule": "selected-model horizon-total weighted WAPE <= 0.30; exploratory target only",
            "dailyWeightedWapeDiagnostic": selected_wape,
        })
    return {
        "status": ("BLOCKED" if not results or any(item["qualityGate"] == "BLOCKED" for item in results)
                   else "FAIL" if any(item["qualityGate"] == "FAIL" for item in results)
                   else "PASS"),
        "evaluationMode": ("expanding_window_walk_forward_no_future_features" if inventory is not None
                           else "expanding_window_walk_forward_sales_only_no_future_features"),
        "evaluationTarget": ("observed_sales_with_native_stockout_censoring" if inventory is not None
                             else "observed_sales_uncorrected_for_stockouts"),
        "salesSnapshotVersion": sales.get("snapshotVersion"),
        "inventoryHistoryVersion": inventory.get("historyVersion") if inventory is not None else None,
        "inventoryDataQuality": inventory.get("dataQuality") if inventory is not None else None,
        "inventoryLabelMethod": ("historical_stockout_labels_applied_to_sales_series_before_each_fold"
                                 if inventory is not None else "NONE_SALES_ONLY_NO_INVENTORY_LABELS"),
        "inventoryLabelUse": ("training_labels_through_cutoff; holdout_stockout_labels_only_mask_censored_actuals_during_scoring"
                              if inventory is not None else "NONE; observed sales are not corrected for lost demand"),
        "stockoutLabelsAvailable": inventory is not None,
        "holdoutInventoryLabelsUsedAsForecastFeatures": False,
        "requiresFutureNativeInventoryObservations": False,
        "inventoryResearchOnly": (bool(inventory.get("researchOnly") or inventory.get("dataQuality") != "NATIVE_ODOO_DAILY_SNAPSHOTS")
                                  if inventory is not None else True),
        "fillRateEvaluationStatus": ("NOT_EVALUATED" if inventory is None else "NOT_COMPUTED_BY_FORECAST_ERROR_METRICS"),
        "businessCostEvaluationStatus": "NOT_EVALUATED_NO_VERIFIED_COST_LABELS",
        "salesDateRange": [min(item.dates).isoformat() for item in raw_series[:1]] + [max(item.dates).isoformat() for item in raw_series[:1]],
        "closedCalendar": {
            "status": "OWNER_CONFIRMED_CLOSED" if closed_dates else "NOT_PROVIDED",
            "maskedDatesInSalesRange": sum(day in closed_dates for day in shared_dates),
            "maskedFromTrainingAndScoring": True,
            "productionForecastCalendarAware": False,
        },
        "productCount": len(raw_series),
        "inventoryLabelledProducts": len(known_series),
        "excludedSuspectInventoryProducts": excluded_warning_count,
        "excludedUnknownInventoryProducts": excluded_unknown_count,
        "horizons": results,
        "writeRequests": [],
    }


def _blocked_inventory_report(sales: dict, inventory: dict, raw_series: list[Series],
                              horizons: list[int], excluded_warning_count: int,
                              excluded_unknown_count: int) -> dict:
    metric_names = ("selected", *BASELINE_MODELS)
    blocked_horizons = []
    for horizon in horizons:
        metrics = {
            name: _metric_summary(Counter(), set(), set())
            for name in metric_names
        }
        metrics["selected"]["selectedModelCounts"] = {}
        for row in metrics.values():
            row["foldStability"] = _fold_stability([])
        blocked_horizons.append({
            "horizonDays": horizon,
            "evaluationStatus": "BLOCKED_INSUFFICIENT_INVENTORY_LABELS",
            "blockedReason": "NO_PRODUCTS_WITH_COMPLETE_NATIVE_INVENTORY_LABELS",
            "walkForwardFoldCount": 0,
            "foldScheduleSample": [],
            "foldMetrics": [],
            "modelSelection": "reselect_using_only_each_fold_training_prefix",
            "metrics": metrics,
            "metricsByTrainingDemandSegment": {},
            "qualityGate": "BLOCKED",
            "qualityGateRule": "selected-model horizon-total weighted WAPE <= 0.30; exploratory target only",
            "dailyWeightedWapeDiagnostic": None,
        })
    dates = raw_series[0].dates
    return {
        "status": "BLOCKED",
        "evaluationMode": "expanding_window_walk_forward_no_future_features",
        "blockedReason": "NO_PRODUCTS_WITH_COMPLETE_NATIVE_INVENTORY_LABELS",
        "salesSnapshotVersion": sales.get("snapshotVersion"),
        "inventoryHistoryVersion": inventory.get("historyVersion") if inventory is not None else None,
        "inventoryDataQuality": inventory.get("dataQuality") if inventory is not None else None,
        "inventoryLabelMethod": "historical_stockout_labels_applied_to_sales_series_before_each_fold",
        "inventoryLabelUse": "training_labels_through_cutoff; holdout_stockout_labels_only_mask_censored_actuals_during_scoring",
        "holdoutInventoryLabelsUsedAsForecastFeatures": False,
        "requiresFutureNativeInventoryObservations": False,
        "inventoryResearchOnly": (bool(inventory.get("researchOnly") or inventory.get("dataQuality") != "NATIVE_ODOO_DAILY_SNAPSHOTS")
                                  if inventory is not None else True),
        "salesDateRange": [min(dates).isoformat(), max(dates).isoformat()],
        "productCount": len(raw_series),
        "inventoryLabelledProducts": 0,
        "excludedSuspectInventoryProducts": excluded_warning_count,
        "excludedUnknownInventoryProducts": excluded_unknown_count,
        "horizons": blocked_horizons,
        "writeRequests": [],
    }


def _fold_stability(fold_metrics: list[dict]) -> dict:
    values = [row["weightedWape"] for row in fold_metrics if row["weightedWape"] is not None]
    if not values:
        return {"scoredFolds": 0, "meanWape": None, "medianWape": None,
                "wapeStdDev": None, "wapeCv": None, "wapeMin": None, "wapeMax": None,
                "biasRatioMean": None, "p80CoverageMean": None, "p80CoverageMin": None,
                "p80CoverageMax": None, "p90CoverageMean": None, "p90CoverageMin": None,
                "p90CoverageMax": None, "winsVsSeasonalNaive": None}
    ordered = sorted(values)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    def coverage_stats(key: str) -> dict:
        observed = [row[key] for row in fold_metrics if row[key] is not None]
        return {
            f"{key}Mean": (sum(observed) / len(observed) if observed else None),
            f"{key}Min": (min(observed) if observed else None),
            f"{key}Max": (max(observed) if observed else None),
        }

    bias_ratios = [row["biasRatio"] for row in fold_metrics if row["biasRatio"] is not None]
    return {
        "scoredFolds": len(values), "meanWape": mean, "medianWape": median,
        "wapeStdDev": variance ** 0.5, "wapeCv": (variance ** 0.5 / mean if mean else None),
        "wapeMin": min(values), "wapeMax": max(values),
        "biasRatioMean": sum(bias_ratios) / len(bias_ratios) if bias_ratios else None,
        **coverage_stats("p80Coverage"), **coverage_stats("p90Coverage"),
        "winsVsSeasonalNaive": None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales-snapshot", type=Path, required=True)
    parser.add_argument("--inventory-history", type=Path)
    parser.add_argument("--sales-only", action="store_true",
                        help="evaluate observed sales without stockout labels; does not estimate lost demand or fill rate")
    parser.add_argument("--closed-dates-file", type=Path,
                        help="owner-confirmed closed-date calendar JSON")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--horizons", type=int, nargs="+", default=[7, 14, 28])
    parser.add_argument("--minimum-train-days", type=int, default=28)
    args = parser.parse_args()
    if any(horizon < 1 or horizon > 90 for horizon in args.horizons):
        parser.error("horizons must be between 1 and 90 days")
    if args.sales_only == (args.inventory_history is not None):
        parser.error("provide exactly one of --inventory-history or --sales-only")
    sales = json.loads(args.sales_snapshot.read_text(encoding="utf-8"))
    inventory = (json.loads(args.inventory_history.read_text(encoding="utf-8"))
                 if args.inventory_history is not None else None)
    closed_dates = set()
    calendar = None
    if args.closed_dates_file is not None:
        calendar = json.loads(args.closed_dates_file.read_text(encoding="utf-8"))
        if calendar.get("status", calendar.get("classification")) != "OWNER_CONFIRMED_CLOSED":
            parser.error("closed-dates file must have owner-confirmed CLOSED status")
        try:
            from datetime import date
            closed_dates = {date.fromisoformat(value) for value in calendar.get("closedDates", [])}
        except (TypeError, ValueError):
            parser.error("closedDates entries must be YYYY-MM-DD strings")
    report = evaluate(sales, inventory, args.horizons, args.minimum_train_days, closed_dates)
    report["sourceSalesSnapshotSha"] = subprocess.check_output(
        ["git", "hash-object", str(args.sales_snapshot.resolve())], cwd=ROOT, text=True,
    ).strip()
    report["sourceInventoryHistorySha"] = (subprocess.check_output(
        ["git", "hash-object", str(args.inventory_history.resolve())], cwd=ROOT, text=True,
    ).strip() if args.inventory_history is not None else None)
    report["sourceClosedDatesSha256"] = (__import__("hashlib").sha256(
        args.closed_dates_file.read_bytes()).hexdigest() if args.closed_dates_file is not None else None)
    report["runtimeSha"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "status": report["status"],
        "evaluationTarget": report["evaluationTarget"],
        "products": report["productCount"], "inventoryLabelledProducts": report["inventoryLabelledProducts"],
        "excludedSuspectInventoryProducts": report["excludedSuspectInventoryProducts"],
        "horizons": [{"days": item["horizonDays"], "qualityGate": item["qualityGate"],
                      "selectedWape": item["metrics"]["selected"]["weightedWape"]}
                     for item in report["horizons"]],
        "writeRequests": report["writeRequests"],
    }))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
