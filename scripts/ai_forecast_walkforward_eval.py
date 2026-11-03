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
                forecast_item, origin: int, horizon: int) -> None:
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
        if index >= len(actual_series.stockoutFlags) or not actual_series.stockoutFlags[index]
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


def _metric_summary(metrics: dict, scored_product_ids: set[int]) -> dict:
    actual = metrics["actualUnits"]
    days = metrics["observedDays"]
    return {
        "status": "PASS" if days and actual > 0 else "BLOCKED_NO_SCORABLE_DEMAND",
        "scoredProducts": len(scored_product_ids),
        "observedDays": days,
        "censoredDaysExcluded": metrics["censoredDays"],
        "actualUnits": round(actual, 4),
        "absoluteErrorUnits": round(metrics["absoluteError"], 4),
        "weightedWape": metrics["absoluteError"] / actual if actual > 0 else None,
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


def _demand_segment(series: Series, training_days: int) -> str:
    observed = [
        max(0.0, float(value))
        for index, value in enumerate(series.units[:training_days])
        if index >= len(series.stockoutFlags) or not series.stockoutFlags[index]
    ]
    if not observed or not any(observed):
        return "NO_DEMAND_TRAIN"
    occurrence = sum(value > 0 for value in observed) / len(observed)
    if occurrence <= 0.10:
        return "SPARSE"
    if occurrence <= 0.40:
        return "INTERMITTENT"
    return "REGULAR"


def evaluate(sales: dict, inventory: dict, horizons: list[int],
             minimum_train_days: int = 28) -> dict:
    if sales.get("writeRequests", []) != [] or inventory.get("writeRequests", []) != []:
        raise ValueError("evaluation snapshots must have empty writeRequests")
    require_native_inventory_event_times(inventory)
    if any(item.get("productId") is None for item in inventory.get("qualityWarnings", [])):
        raise ValueError("global inventory quality warning blocks stockout-aware evaluation")

    warning_ids = {
        int(item["productId"])
        for item in inventory.get("qualityWarnings", [])
        if item.get("productId") is not None
    }
    raw_series = [Series(**item) for item in sales.get("series", [])]
    if not raw_series:
        raise ValueError("sales snapshot has no product series")
    shared_dates = raw_series[0].dates
    if any(item.dates != shared_dates for item in raw_series):
        raise ValueError("all product series must share the same daily date range")
    applied = [apply_inventory_history(item, inventory) for item in raw_series]
    known_series = []
    excluded_warning_count = 0
    excluded_unknown_count = 0
    for item in applied:
        if item.productId in warning_ids:
            excluded_warning_count += 1
        elif (item.stockoutDataQuality in ("EXCLUDED_SUSPECT_HISTORICAL_INVENTORY", "HISTORICAL_INVENTORY_INCOMPLETE")
              or len(item.stockoutFlags) != len(item.units)):
            excluded_unknown_count += 1
        else:
            known_series.append(item)
    if not known_series:
        raise ValueError("no product series has complete, usable inventory labels")

    vendor_id = int(sales.get("companyId") or 1)
    outlet_id = int(sales.get("outletId") or vendor_id)
    results = []
    for horizon in horizons:
        methods = {"selected": {"metrics": Counter(), "products": set(), "models": Counter()},
                   **{model: {"metrics": Counter(), "products": set()} for model in BASELINE_MODELS}}
        segment_methods = {}
        folds = []
        origins = walk_forward_origins(len(shared_dates), horizon, minimum_train_days)
        for origin in origins:
            train_series = [series.model_copy(update={
                "dates": series.dates[:origin], "units": series.units[:origin],
                "stockoutFlags": series.stockoutFlags[:origin], "selectedModel": None,
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
            for series in known_series:
                segment = _demand_segment(series, origin)
                segment_methods.setdefault(segment, {
                    method: {"metrics": Counter(), "products": set(), "models": Counter()}
                    for method in methods
                })
                selected = predictions[series.productId]
                methods["selected"]["models"][selected.model] += 1
                _score_fold(methods["selected"]["metrics"], methods["selected"]["products"],
                            series, selected, origin, horizon)
                segment_methods[segment]["selected"]["models"][selected.model] += 1
                _score_fold(segment_methods[segment]["selected"]["metrics"],
                            segment_methods[segment]["selected"]["products"],
                            series, selected, origin, horizon)
                for model in BASELINE_MODELS:
                    _score_fold(methods[model]["metrics"], methods[model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon)
                    _score_fold(segment_methods[segment][model]["metrics"],
                                segment_methods[segment][model]["products"],
                                series, baseline_predictions[model][series.productId], origin, horizon)
            folds.append({
                "trainEnd": shared_dates[origin - 1].isoformat(),
                "evaluationStart": test_start.isoformat(),
                "evaluationEnd": shared_dates[origin + horizon - 1].isoformat(),
                "trainingDays": origin,
            })
        summaries = {
            method: _metric_summary(row["metrics"], row["products"])
            for method, row in methods.items()
        }
        summaries["selected"]["selectedModelCounts"] = dict(methods["selected"]["models"])
        segment_summaries = {}
        for segment, segment_rows in segment_methods.items():
            segment_summaries[segment] = {
                method: _metric_summary(row["metrics"], row["products"])
                for method, row in segment_rows.items()
            }
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
        "evaluationMode": "expanding_window_walk_forward_no_future_features",
        "salesSnapshotVersion": sales.get("snapshotVersion"),
        "inventoryHistoryVersion": inventory.get("historyVersion"),
        "inventoryDataQuality": inventory.get("dataQuality"),
        "inventoryLabelMethod": "historical_stockout_labels_applied_to_sales_series_before_each_fold",
        "inventoryLabelUse": "training_labels_through_cutoff; holdout_stockout_labels_only_mask_censored_actuals_during_scoring",
        "holdoutInventoryLabelsUsedAsForecastFeatures": False,
        "requiresFutureNativeInventoryObservations": False,
        "inventoryResearchOnly": bool(inventory.get("researchOnly") or inventory.get("dataQuality") != "NATIVE_ODOO_DAILY_SNAPSHOTS"),
        "salesDateRange": [min(item.dates).isoformat() for item in raw_series[:1]] + [max(item.dates).isoformat() for item in raw_series[:1]],
        "productCount": len(raw_series),
        "inventoryLabelledProducts": len(known_series),
        "excludedSuspectInventoryProducts": excluded_warning_count,
        "excludedUnknownInventoryProducts": excluded_unknown_count,
        "horizons": results,
        "writeRequests": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales-snapshot", type=Path, required=True)
    parser.add_argument("--inventory-history", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--horizons", type=int, nargs="+", default=[7, 14, 28])
    parser.add_argument("--minimum-train-days", type=int, default=28)
    args = parser.parse_args()
    if any(horizon < 1 or horizon > 90 for horizon in args.horizons):
        parser.error("horizons must be between 1 and 90 days")
    sales = json.loads(args.sales_snapshot.read_text(encoding="utf-8"))
    inventory = json.loads(args.inventory_history.read_text(encoding="utf-8"))
    report = evaluate(sales, inventory, args.horizons, args.minimum_train_days)
    report["sourceSalesSnapshotSha"] = subprocess.check_output(
        ["git", "hash-object", str(args.sales_snapshot.resolve())], cwd=ROOT, text=True,
    ).strip()
    report["sourceInventoryHistorySha"] = subprocess.check_output(
        ["git", "hash-object", str(args.inventory_history.resolve())], cwd=ROOT, text=True,
    ).strip()
    report["runtimeSha"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "status": report["status"],
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
