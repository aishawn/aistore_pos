"""Held-out order-cycle comparison from a verified replenishment sales export.

No remote calls, no business writes. Reports planning proxies, never realized savings.
"""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "forecast-service"))
from app.forecast_engine import _normalise, _order_cycle_exposure, _select_model, forecast
from app.schemas import InventoryCostPolicy, Series, ForecastRequest


def evaluate(source: dict) -> dict:
    policy = InventoryCostPolicy()
    products = {p["id"]: p for p in source["products"]}
    evaluated = skipped = model_changes = 0
    totals = {name: {"missedUnits": 0., "inventoryUnitDays": 0., "observedDemand": 0.,
                    "lostMargin": 0., "holdingCost": 0., "obsolescenceCost": 0., "servicePenalty": 0.}
              for name in ("businessCost", "wape")}
    for sample in source["salesValidation"]:
        product = products[sample["productId"]]
        cost, price = product.get("unitCost"), product.get("unitPrice")
        if (not isinstance(cost, (float, int)) or not isinstance(price, (float, int))
                or not 0 < cost < price or len(sample["units"]) < 42):
            skipped += 1
            continue
        for end in range(len(sample["units"]) - 14, len(sample["units"]), 7):
            training = Series(productId=sample["productId"], dates=[date.fromisoformat(d) for d in sample["dates"][:end]],
                              units=sample["units"][:end], unitCost=cost, unitPrice=price)
            actual = [max(0., v) for v in sample["units"][end:end+7]]
            a = _select_model(training, 7, policy)[0]
            b = _select_model(training, 7, None)[0]
            model_changes += a != b
            evaluated += 1
            for name, model in (("businessCost", a), ("wape", b)):
                prediction = _normalise(training.units, 7, model=model)[0]
                missed, exposure = _order_cycle_exposure(prediction, actual)
                total = totals[name]
                total["missedUnits"] += missed
                total["inventoryUnitDays"] += exposure
                total["observedDemand"] += sum(actual)
                total["lostMargin"] += missed * (price-cost)
                total["holdingCost"] += exposure * cost * policy.annualHoldingRate / 365
                total["obsolescenceCost"] += exposure * cost * policy.annualObsolescenceRate / 365
                total["servicePenalty"] += max(0., missed-(1-policy.serviceLevel)*sum(actual)) * (price-cost)
    for total in totals.values():
        total["totalPlanningCost"] = sum(total[k] for k in ("lostMargin", "holdingCost", "obsolescenceCost", "servicePenalty"))
        total["fillRate"] = 1 - total["missedUnits"] / total["observedDemand"] if total["observedDemand"] else None
    return {"scope": "OFFLINE_HELD_OUT_PLANNING_PROXY_NOT_REALIZED_SAVINGS",
            "salesHistory": source.get("salesHistory"), "sourceGeneratedAt": source.get("generatedAt"),
            "inputSeries": len(source["salesValidation"]), "skippedInvalidCostsOrShortHistory": skipped,
            "evaluatedSeries": len(source["salesValidation"])-skipped, "evaluatedCycles": evaluated,
            "differentSelectedModels": model_changes, "policy": policy.model_dump(), "totals": totals,
            "limitations": ["No native historical opening-stock or delivery trajectory used",
                            "Each seven-day cycle assumes immediate arrival and zero opening stock",
                            "Only valid cost/price series evaluated; not representative of the entire store",
                            "Service penalty is measured per held-out cycle; target rates are planning assumptions",
                            "Historical stockout censorship is unknown; observed sales can understate true demand"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--features", type=Path)
    args = parser.parse_args()
    contents = args.input.read_bytes()
    result = evaluate(json.loads(contents.decode("utf-8-sig")))
    result["inputSha256"] = hashlib.sha256(contents).hexdigest()
    if args.features:
        feature_contents = args.features.read_bytes()
        result["coldStartProxy"] = evaluate_cold_start(json.loads(contents.decode("utf-8-sig")), json.loads(feature_contents))
        result["featuresSha256"] = hashlib.sha256(feature_contents).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(result))


def evaluate_cold_start(source: dict, features: dict) -> dict:
    """Mask a mature SKU's history; other SKUs stop before the held-out week."""
    by_id = {p["id"]: p for p in features["products"]}
    samples = source["salesValidation"]
    cases = total_demand = absolute_error = zero_baseline_error = 0.
    for target in samples:
        def make(sample, is_new):
            native = by_id[sample["productId"]]
            price = native["list_price"]
            return Series(productId=sample["productId"],
                dates=[] if is_new else [date.fromisoformat(d) for d in sample["dates"][:-7]],
                units=[] if is_new else sample["units"][:-7], isNew=is_new,
                category=str(native["categ_id"][0]) if native.get("categ_id") else None,
                brand=str(native["brand_id"][0]) if native.get("brand_id") else None,
                priceBand="LOW_LE_15" if price <= 15 else "MID_15_30" if price <= 30 else "HIGH_GT_30")
        if target["productId"] not in by_id or len(target["units"]) < 35:
            continue
        target_series = make(target, True)
        donors = [make(sample, False) for sample in samples if sample["productId"] != target["productId"] and sample["productId"] in by_id]
        response = forecast(ForecastRequest(vendorId=5, outletId=5, horizonDays=7,
            forecastStartDate=date.fromisoformat(target["dates"][-8]), series=donors+[target_series])).items[-1]
        if response.selectionStatus != "ANALOG_COLD_START":
            continue
        actual = sum(max(0, v) for v in target["units"][-7:])
        predicted = sum(p.p50 for p in response.forecast)
        cases += 1
        total_demand += actual
        absolute_error += abs(predicted-actual)
        zero_baseline_error += actual
    return {"scope": "MASKED_MATURE_SKUS_NOT_REAL_NEW_LAUNCH_ACCURACY", "eligibleAnalogCases": int(cases),
            "heldoutDays": 7, "donorFutureDaysUsed": 0, "brandFieldAvailable": features.get("brandFieldAvailable", False),
            "observedDemandUnits": total_demand, "absoluteCycleErrorUnits": absolute_error,
            "zeroHistoryBaselineErrorUnits": zero_baseline_error,
            "cycleWape": absolute_error/total_demand if total_demand else None,
            "confidence": "LOW", "limitations": ["Mature SKU masking is a proxy, not real product launch evidence",
                "When brand metadata is absent matching uses category and price band only",
                "No-sales purchase suggestions remain paused regardless of analog forecasts"]}


if __name__ == "__main__":
    main()
