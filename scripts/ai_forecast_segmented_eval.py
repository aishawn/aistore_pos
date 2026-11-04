"""Sales-only, leakage-aware segmented forecast comparison for a fixed snapshot."""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from math import isfinite
from pathlib import Path
from statistics import mean, pstdev

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "forecast-service"))

from app.forecast_engine import MODEL_NAMES, WAPE_BASELINE_MODEL, forecast
from app.schemas import ForecastRequest, Series


def demand_segment(units: list[float], dates: list[date], origin: int,
                   closed_dates: set[date] | None = None) -> str:
    closed_dates = closed_dates or set()
    training = [(day, max(0.0, float(value)))
                for day, value in zip(dates[:origin], units[:origin])
                if day not in closed_dates]
    train = [value for _, value in training]
    first_sale = next((day for day, value in training if value > 0), None)
    if first_sale is not None and (dates[origin - 1] - first_sale).days <= 60:
        return "RECENT_FIRST_SALE_PROXY"
    if not train:
        return "NO_DEMAND"

    occurrence = sum(value > 0 for value in train) / len(train)
    average = mean(train)
    if occurrence <= 0.10 or average <= 0.25:
        return "SPARSE_LONG_TAIL"
    if occurrence <= 0.40:
        return "INTERMITTENT"

    if origin >= 84 and average >= 1.0:
        weekdays: dict[int, list[float]] = defaultdict(list)
        for day, value in training:
            weekdays[day.weekday()].append(value)
        weekday_means = [mean(values) for values in weekdays.values() if values]
        if len(weekday_means) == 7 and min(weekday_means) > 0.1 \
                and max(weekday_means) / min(weekday_means) >= 1.7:
            return "WEEKLY_PATTERN_PROXY"

    cv = pstdev(train) / average if average > 0 else float("inf")
    if average >= 2.0 and occurrence >= 0.60 and cv <= 0.75:
        return "STABLE_HIGH"
    return "REGULAR"


def open_training_values(units: list[float], dates: list[date], origin: int,
                         closed_dates: set[date]) -> list[float]:
    return [max(0.0, float(value)) for day, value in zip(dates[:origin], units[:origin])
            if day not in closed_dates]


def open_holdout_offsets(dates: list[date], origin: int, horizon: int,
                         closed_dates: set[date]) -> list[int]:
    return [offset for offset, day in enumerate(dates[origin:origin + horizon])
            if day not in closed_dates]


def new_metrics() -> dict:
    return {
        "products": set(), "productWindows": 0, "observedDays": 0,
        "actualUnits": 0.0, "absoluteError": 0.0, "signedError": 0.0,
        "maseNumerator": 0.0, "maseDenominator": 0.0,
        "p80CoveredDays": 0, "p90CoveredDays": 0,
        "lowConfidenceWindows": 0, "safetyViolations": 0,
        "expectedProductWindows": 0,
    }


def add_window(metrics: dict, product_id: int, train: list[float], actual: list[float], points,
               confidence: str) -> None:
    metrics["products"].add(product_id)
    metrics["productWindows"] += 1
    errors = []
    for value, point in zip(actual, points):
        demand = max(0.0, float(value))
        error = float(point.p50) - demand
        errors.append(error)
        metrics["actualUnits"] += demand
        metrics["absoluteError"] += abs(error)
        metrics["signedError"] += error
        metrics["p80CoveredDays"] += int(demand <= float(point.p80))
        metrics["p90CoveredDays"] += int(demand <= float(point.p90))
        metrics["observedDays"] += 1
        if not all(isfinite(float(q)) and float(q) >= 0 for q in (point.p50, point.p80, point.p90)) \
                or point.p50 > point.p80 or point.p80 > point.p90:
            metrics["safetyViolations"] += 1
    scale = mean(abs(right - left) for left, right in zip(train, train[1:])) if len(train) > 1 else 0.0
    if scale > 0:
        metrics["maseNumerator"] += sum(abs(error) for error in errors)
        metrics["maseDenominator"] += scale * len(errors)
    metrics["lowConfidenceWindows"] += int(confidence == "LOW")


def summarize(metrics: dict | None, expected_product_windows: int | None = None) -> dict | None:
    if metrics is None:
        return None
    days = metrics["observedDays"]
    actual = metrics["actualUnits"]
    return {
        "productCount": len(metrics["products"]),
        "productWindows": metrics["productWindows"],
        "expectedProductWindows": expected_product_windows if expected_product_windows is not None
        else metrics["expectedProductWindows"],
        "predictionCoverage": metrics["productWindows"] / expected_product_windows
        if expected_product_windows else None,
        "observedDays": days,
        "weightedWape": metrics["absoluteError"] / actual if actual > 0 else None,
        "mase": metrics["maseNumerator"] / metrics["maseDenominator"]
        if metrics["maseDenominator"] > 0 else None,
        "biasRatio": metrics["signedError"] / actual if actual > 0 else None,
        "p80Coverage": metrics["p80CoveredDays"] / days if days else None,
        "p90Coverage": metrics["p90CoveredDays"] / days if days else None,
        "modelLowConfidenceWindows": metrics["lowConfidenceWindows"],
        "modelLowConfidenceRate": metrics["lowConfidenceWindows"] / metrics["productWindows"]
        if metrics["productWindows"] else None,
        "predictionSafetyViolations": metrics["safetyViolations"],
    }


def fold_stability(rows: list[dict], baseline_rows: list[dict] | None = None) -> dict:
    scored = [row for row in rows if row.get("weightedWape") is not None]
    values = sorted(float(row["weightedWape"]) for row in scored)
    if not values:
        return {"foldCount": len(rows), "scoredFoldCount": 0}

    def percentile(fraction: float) -> float:
        return percentile_of(values, fraction)

    result = {
        "foldCount": len(rows),
        "scoredFoldCount": len(scored),
        "wapeMean": mean(values),
        "wapeMedian": percentile(0.50),
        "wapeP25": percentile(0.25),
        "wapeP75": percentile(0.75),
        "wapeMin": values[0],
        "wapeMax": values[-1],
        "wapeStdDev": pstdev(values),
        "wapeCoefficientOfVariation": pstdev(values) / mean(values) if mean(values) else None,
        "biasSignConsistency": max(
            sum(float(row.get("biasRatio") or 0) > 0 for row in scored),
            sum(float(row.get("biasRatio") or 0) < 0 for row in scored),
        ) / len(scored),
    }
    if baseline_rows is not None:
        baseline_by_origin = {
            row["evaluationStart"]: row for row in baseline_rows
            if row.get("weightedWape") is not None
        }
        paired = [
            row for row in scored
            if row["evaluationStart"] in baseline_by_origin
        ]
        improvements = [
            1 - float(row["weightedWape"])
            / float(baseline_by_origin[row["evaluationStart"]]["weightedWape"])
            for row in paired
            if float(baseline_by_origin[row["evaluationStart"]]["weightedWape"]) > 0
        ]
        result["pairedBaselineFolds"] = len(improvements)
        result["beatBaselineFoldCount"] = sum(value > 0 for value in improvements)
        result["beatBaselineFoldRate"] = (
            result["beatBaselineFoldCount"] / len(improvements) if improvements else None
        )
        result["medianRelativeImprovementVsBaseline"] = (
            percentile_of(improvements, 0.50) if improvements else None
        )
    return result


def percentile_of(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def evaluate(snapshot: dict, horizons: list[int], minimum_train_days: int,
             validation_fraction: float, minimum_segment_products: int,
             closed_dates: set[date] | None = None) -> dict:
    if snapshot.get("writeRequests", []) != []:
        raise ValueError("snapshot must have empty writeRequests")
    raw = snapshot.get("series", [])
    if not raw:
        raise ValueError("snapshot has no series")
    series = [Series(**{key: item[key] for key in (
        "productId", "dates", "units", "stockoutFlags") if key in item}) for item in raw]
    dates = series[0].dates
    closed_dates = closed_dates or set()
    if any(item.dates != dates for item in series):
        raise ValueError("series must share the same daily date range")
    if not all(not item.stockoutFlags for item in series):
        raise ValueError("this evaluator only accepts snapshots without stockout labels")

    result_horizons = []
    for horizon in horizons:
        origins = list(range(minimum_train_days, len(dates) - horizon + 1, horizon))
        if len(origins) < 5:
            raise ValueError(f"not enough walk-forward folds for {horizon}-day horizon")
        split_index = max(1, min(len(origins) - 1, int(len(origins) * validation_fraction)))
        metrics: dict[tuple[str, str, str], dict] = {}
        fold_rows: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
        segment_validation_products: dict[str, set[int]] = defaultdict(set)
        segment_counts: dict[str, int] = defaultdict(int)

        for fold_index, origin in enumerate(origins):
            split = "validation" if fold_index < split_index else "holdout"
            fold_metrics: dict[tuple[str, str, str], dict] = {}
            segments = {
                item.productId: demand_segment(item.units, dates, origin, closed_dates)
                for item in series
            }
            for segment, product_id in ((segments[item.productId], item.productId) for item in series):
                segment_counts[f"{split}:{segment}"] += 1
                for model in MODEL_NAMES:
                    metrics.setdefault((split, segment, model), new_metrics())["expectedProductWindows"] += 1
                    fold_bucket = fold_metrics.setdefault((split, segment, model), new_metrics())
                    fold_bucket["expectedProductWindows"] += 1
                if split == "validation":
                    segment_validation_products[segment].add(product_id)

            for model in MODEL_NAMES:
                training = [Series(
                    productId=item.productId,
                    dates=item.dates[:origin],
                    units=item.units[:origin],
                    stockoutFlags=[day in closed_dates for day in item.dates[:origin]],
                    selectedModel=model,
                ) for item in series]
                response = forecast(ForecastRequest(
                    vendorId=max(1, int(snapshot.get("companyId") or 1)),
                    outletId=max(1, int(snapshot.get("outletId") or snapshot.get("companyId") or 1)),
                    horizonDays=horizon,
                    sourceVersion="sales_only_segment_walk_forward_research_v1",
                    forecastStartDate=dates[origin],
                    series=training,
                ))
                predictions = {item.productId: item for item in response.items}
                for item in series:
                    prediction = predictions.get(item.productId)
                    if prediction is None or len(prediction.forecast) != horizon:
                        continue
                    key = (split, segments[item.productId], model)
                    bucket = metrics.setdefault(key, new_metrics())
                    fold_bucket = fold_metrics[key]
                    open_train = open_training_values(item.units, item.dates, origin, closed_dates)
                    open_offsets = open_holdout_offsets(dates, origin, horizon, closed_dates)
                    open_actual = [item.units[origin + offset] for offset in open_offsets]
                    open_forecast = [prediction.forecast[offset] for offset in open_offsets]
                    confidence = "HIGH" if len(open_train) >= 56 else "MEDIUM" if len(open_train) >= 14 else "LOW"
                    add_window(bucket, item.productId, open_train, open_actual,
                               open_forecast, confidence)
                    add_window(fold_bucket, item.productId, open_train, open_actual,
                               open_forecast, confidence)

            for key, bucket in fold_metrics.items():
                row = summarize(bucket, bucket["expectedProductWindows"])
                row["foldIndex"] = fold_index
                row["evaluationStart"] = dates[origin].isoformat()
                fold_rows[key].append(row)

        validation_segments = sorted({segment for split, segment, _ in metrics if split == "validation"})
        champions = {}
        for segment in validation_segments:
            if len(segment_validation_products[segment]) < minimum_segment_products:
                continue
            candidates = {
                model: summarize(metrics.get(("validation", segment, model)),
                                 segment_counts.get(f"validation:{segment}", 0))
                for model in MODEL_NAMES
            }
            candidates = {model: value for model, value in candidates.items()
                          if value and value["weightedWape"] is not None}
            if candidates:
                champions[segment] = min(
                    candidates, key=lambda model: (candidates[model]["weightedWape"], model))

        holdout = {}
        for segment, model in champions.items():
            holdout_expected = segment_counts.get(f"holdout:{segment}", 0)
            champion = summarize(metrics.get(("holdout", segment, model)), holdout_expected)
            baseline = summarize(metrics.get(("holdout", segment, WAPE_BASELINE_MODEL)), holdout_expected)
            improvement = None
            if champion and baseline and baseline["weightedWape"]:
                improvement = 1 - champion["weightedWape"] / baseline["weightedWape"]
            holdout[segment] = {
                "championModelChosenOnValidation": model,
                "champion": champion,
                "baselineModel": WAPE_BASELINE_MODEL,
                "baseline": baseline,
                "relativeWapeImprovementVsBaseline": improvement,
                "meetsExploratoryAccuracyGate": bool(
                    champion and baseline and improvement is not None
                    and improvement >= 0.05 and champion["biasRatio"] is not None
                    and abs(champion["biasRatio"]) <= 0.10
                    and champion["predictionSafetyViolations"] == 0
                ),
            }

        segment_reports = {}
        for segment in sorted({segment for _, segment, _ in metrics}):
            baseline_validation_rows = fold_rows.get(
                ("validation", segment, WAPE_BASELINE_MODEL), []
            )
            baseline_holdout_rows = fold_rows.get(
                ("holdout", segment, WAPE_BASELINE_MODEL), []
            )
            validation_models = {}
            holdout_models = {}
            for model in MODEL_NAMES:
                validation_summary = summarize(
                    metrics.get(("validation", segment, model)),
                    segment_counts.get(f"validation:{segment}", 0),
                )
                holdout_summary = summarize(
                    metrics.get(("holdout", segment, model)),
                    segment_counts.get(f"holdout:{segment}", 0),
                )
                if validation_summary is not None:
                    validation_summary["foldStability"] = fold_stability(
                        fold_rows.get(("validation", segment, model), []),
                        baseline_validation_rows,
                    )
                if holdout_summary is not None:
                    holdout_summary["foldStability"] = fold_stability(
                        fold_rows.get(("holdout", segment, model), []),
                        baseline_holdout_rows,
                    )
                validation_models[model] = validation_summary
                holdout_models[model] = holdout_summary
            segment_reports[segment] = {
                "validationProducts": len(segment_validation_products[segment]),
                "validationProductWindows": segment_counts.get(f"validation:{segment}", 0),
                "holdoutProductWindows": segment_counts.get(f"holdout:{segment}", 0),
                "validationModels": validation_models,
                "holdoutModels": holdout_models,
                "selectedChampion": champions.get(segment),
                "championHoldout": holdout.get(segment),
            }
        result_horizons.append({
            "horizonDays": horizon,
            "foldCount": len(origins),
            "validationFoldCount": split_index,
            "holdoutFoldCount": len(origins) - split_index,
            "validationOrigins": [dates[index].isoformat() for index in origins[:split_index]],
            "holdoutOrigins": [dates[index].isoformat() for index in origins[split_index:]],
            "modelSelectionRule": "minimum validation weighted WAPE; minimum segment size enforced",
            "segments": segment_reports,
        })

    return {
        "status": "RESEARCH_ONLY_BLOCKED_STOCKOUT_LABELS_UNAVAILABLE",
        "evaluationMode": "sales_only_expanding_window_segmented_walk_forward",
        "snapshotVersion": snapshot.get("snapshotVersion"),
        "companyId": snapshot.get("companyId"),
        "dateRange": [dates[0].isoformat(), dates[-1].isoformat()],
        "historyDays": len(dates),
        "productCount": len(series),
        "calendar": {
            "closedDates": sorted(day.isoformat() for day in closed_dates),
            "closedDatesInSnapshot": sorted(day.isoformat() for day in dates if day in closed_dates),
            "closedDaysMaskedFromTrainingAndScoring": sum(day in closed_dates for day in dates),
            "productionForecastCalendarAware": False,
        },
        "horizons": result_horizons,
        "segmentDefinitions": {
            "RECENT_FIRST_SALE_PROXY": "first observed sale is within 60 days of the forecast origin; not a verified creation date",
            "SPARSE_LONG_TAIL": "training occurrence <= 10% or mean units/day <= 0.25",
            "INTERMITTENT": "training occurrence > 10% and <= 40%",
            "WEEKLY_PATTERN_PROXY": "seven training weekdays, mean >= 1 unit/day, positive minimum weekday mean, max/min >= 1.7",
            "STABLE_HIGH": "mean >= 2 units/day, occurrence >= 60%, coefficient of variation <= 0.75",
            "REGULAR": "remaining demand histories",
        },
        "stockoutLabelsAvailable": False,
        "nativeInventoryAvailable": False,
        "supplierLeadTimeAvailable": False,
        "businessCostMetrics": None,
        "automatablePurchaseRecommendation": False,
        "writeRequests": [],
        "limitations": [
            "Unobserved stockouts may censor recorded sales; this dataset cannot evaluate lost demand.",
            "New-item status is only proxied by first sale date because product creation dates are absent.",
            "Weekly patterns are exploratory and do not establish annual seasonality from one year of data.",
            "This offline run masks owner-confirmed closed dates from model training and open-day scoring; production forecast requests remain calendar-unaware.",
            "Model winners are selected on earlier validation folds and scored on later holdout folds; this is still one store and one 365-day window.",
            "No true inventory, lead-time, expiry, or realized cost data is available for operational planning metrics.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--horizons", type=int, nargs="+", default=[7, 14, 28])
    parser.add_argument("--minimum-train-days", type=int, default=120)
    parser.add_argument("--validation-fraction", type=float, default=0.70)
    parser.add_argument("--minimum-segment-products", type=int, default=20)
    parser.add_argument("--closed-dates-file", type=Path)
    args = parser.parse_args()
    if any(h < 1 or h > 90 for h in args.horizons):
        parser.error("horizons must be between 1 and 90 days")
    if not 0.5 <= args.validation_fraction <= 0.9:
        parser.error("validation fraction must be between 0.5 and 0.9")
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    closed_dates = set()
    if args.closed_dates_file:
        calendar = json.loads(args.closed_dates_file.read_text(encoding="utf-8"))
        if not isinstance(calendar.get("closedDates"), list):
            parser.error("closed-dates file must contain a closedDates array")
        try:
            closed_dates = {date.fromisoformat(value) for value in calendar["closedDates"]}
        except (TypeError, ValueError):
            parser.error("closedDates entries must be YYYY-MM-DD strings")
    report = evaluate(snapshot, args.horizons, args.minimum_train_days,
                      args.validation_fraction, args.minimum_segment_products, closed_dates)
    report["sourceSnapshotSha256"] = __import__("hashlib").sha256(
        args.snapshot.read_bytes()).hexdigest()
    report["sourceCalendarSha256"] = (__import__("hashlib").sha256(
        args.closed_dates_file.read_bytes()).hexdigest() if args.closed_dates_file else None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "status": report["status"],
        "productCount": report["productCount"], "horizons": len(report["horizons"]),
        "writeRequests": report["writeRequests"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
