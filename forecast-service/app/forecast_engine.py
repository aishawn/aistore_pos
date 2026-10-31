from datetime import date, timedelta
from statistics import mean, median, pstdev
from math import ceil

from .schemas import (BacktestItem, BacktestRequest, BacktestResponse,
                       ForecastItem, ForecastPoint, ForecastRequest, ForecastResponse,
                       InventoryDecision, InventoryPoint, InventoryRequest, InventoryResponse)


MODEL = "seasonal_naive_v1"
MODEL_NAMES = ("seasonal_naive_v1", "moving_average_7_v1", "exponential_smoothing_v1",
               "croston_sba_v1", "tsb_v1", "two_stage_occurrence_v1")


def _normalise(values: list[float], horizon: int, stockout_flags: list[bool] | None = None,
               model: str = MODEL) -> tuple[list[float], str, str]:
    flags = stockout_flags or []
    usable = [
        max(0.0, float(value))
        for index, value in enumerate(values)
        if value is not None and not (index < len(flags) and flags[index])
    ]
    censored = len(usable) != len(values)
    clean = usable
    if not clean:
        return [0.0] * horizon, "INCOMPLETE", "LOW"
    if len(clean) < 14:
        return [mean(clean)] * horizon, "CENSORED_DEMAND" if censored else "INSUFFICIENT_HISTORY", "LOW"
    if model == "moving_average_7_v1":
        baseline = [mean(clean[-7:])] * horizon
    elif model == "exponential_smoothing_v1":
        level = clean[0]
        for value in clean[1:]:
            level = 0.30 * value + 0.70 * level
        baseline = [level] * horizon
    elif model == "croston_sba_v1":
        nonzero = [(index, value) for index, value in enumerate(clean) if value > 0]
        if not nonzero:
            baseline = [0.0] * horizon
        else:
            demand = mean(value for _, value in nonzero)
            intervals = [nonzero[0][0] + 1] + [index - previous for (previous, _), (index, _) in zip(nonzero, nonzero[1:])]
            baseline = [0.95 * demand / max(mean(intervals), 1.0)] * horizon
    elif model == "tsb_v1":
        nonzero = [value for value in clean if value > 0]
        if not nonzero:
            baseline = [0.0] * horizon
        else:
            demand = nonzero[0]
            probability = 1.0 if clean[0] > 0 else 0.0
            for value in clean[1:]:
                occurrence = 1.0 if value > 0 else 0.0
                probability = 0.20 * occurrence + 0.80 * probability
                if value > 0:
                    demand = 0.20 * value + 0.80 * demand
            baseline = [probability * demand] * horizon
    elif model == "two_stage_occurrence_v1":
        nonzero = [value for value in clean if value > 0]
        probability = len(nonzero) / len(clean) if clean else 0.0
        amount = mean(nonzero) if nonzero else 0.0
        baseline = [probability * amount] * horizon
    else:
        # Removing censored days must not shift a Friday peak onto Thursday.
        weekday_values = {}
        for index, value in enumerate(values):
            if value is not None and not (index < len(flags) and flags[index]):
                weekday_values[index % 7] = max(0.0, float(value))
        baseline = [weekday_values.get((len(values) + offset) % 7, mean(clean)) for offset in range(horizon)]
    quality = "CENSORED_DEMAND" if censored else "VALID"
    confidence = "LOW" if censored else ("HIGH" if len(clean) >= 56 else "MEDIUM")
    return baseline[:horizon], quality, confidence


def _order_cycle_exposure(predicted: list[float], actual: list[float]) -> tuple[float, float]:
    """One simulated order arrives at cycle start; carry unsold units across days.

    This is a comparable planning proxy, not reconstruction of historical stock.
    Units are rounded as in the replenishment UI; holding uses closing stock.
    """
    stock = float(ceil(sum(predicted)))
    missed = inventory_unit_days = 0.0
    for demand in actual:
        missed += max(0.0, demand - stock)
        stock = max(0.0, stock - demand)
        inventory_unit_days += stock
    return missed, inventory_unit_days


def _select_model(series, horizon: int = 7, policy=None, validate_cost: bool = True) -> tuple[str, str, dict[str, float], str | None, dict, dict]:
    """Select using rolling business loss when costs are valid, otherwise WAPE.

    The service deliberately refuses to call a short series a validated model
    selection. The caller still receives a deterministic seasonal-naive
    forecast, but the response labels it as insufficient history.
    """
    values = [max(0.0, float(value)) for value in series.units]
    if len(values) < 28:
        return MODEL, "INSUFFICIENT_HISTORY", {}, None, {}, {}
    flags = series.stockoutFlags or []
    use_cost = policy is not None and series.unitCost is not None and series.unitPrice is not None and series.unitPrice > series.unitCost
    scores: dict[str, float] = {}
    cost_details = {}
    wape_scores = {}
    for candidate in MODEL_NAMES:
        errors: list[float] = []
        actual_total = 0.0
        observed = 0
        folds = 0
        missed_units = 0.0
        inventory_unit_days = 0.0
        for end in range(14, len(values) - horizon + 1, horizon):
            train = values[:end]
            train_flags = flags[:end] if flags else []
            predicted, _, _ = _normalise(train, horizon, train_flags, candidate)
            actual_cycle = values[end:end + horizon]
            # Unobserved demand prevents an honest inventory trajectory.
            if use_cost and any(flags[end:end + horizon]):
                continue
            folds += 1
            if use_cost:
                missed, exposure = _order_cycle_exposure(predicted, actual_cycle)
                missed_units += missed
                inventory_unit_days += exposure
            for offset, actual in enumerate(actual_cycle):
                if end + offset < len(flags) and flags[end + offset]:
                    continue
                errors.append(abs(predicted[offset] - actual))
                actual_total += actual
                observed += 1

        if errors and actual_total > 0:
            wape_scores[candidate] = sum(errors) / actual_total
            if use_cost:
                # Penalise missed demand beyond the requested service level.
                shortfall = max(0.0, missed_units - (1 - policy.serviceLevel) * actual_total)
                margin = series.unitPrice - series.unitCost
                lost_margin = missed_units * margin / observed
                holding = inventory_unit_days * series.unitCost * policy.annualHoldingRate / 365 / observed
                obsolescence = inventory_unit_days * series.unitCost * policy.annualObsolescenceRate / 365 / observed
                service_penalty = shortfall * margin / observed
                scores[candidate] = lost_margin + holding + obsolescence + service_penalty
                cost_details[candidate] = {"lostMarginPerDay": lost_margin, "holdingCostPerDay": holding,
                    "obsolescenceCostPerDay": obsolescence, "servicePenaltyPerDay": service_penalty,
                    "totalCostPerDay": scores[candidate], "fillRate": 1 - missed_units / actual_total,
                    "evaluatedDays": observed, "evaluatedFolds": folds}
            else:
                scores[candidate] = sum(errors) / actual_total
    if not scores:
        return MODEL, "BLOCKED", {}, None, {}, {}
    winner = min(scores, key=lambda candidate: (scores[candidate], candidate))
    validation = {}
    metric = "rolling_business_cost_aud_per_day" if use_cost else "rolling_wape"
    if use_cost and validate_cost:
        baseline = min(wape_scores, key=lambda candidate: (wape_scores[candidate], candidate))
        winner, metric = baseline, "rolling_wape_cost_validation_fallback"
        validation = {"status": "INSUFFICIENT_UNCENSORED_VALIDATION"}
        # Fix candidate identities before three untouched non-overlapping cycles.
        validation_days = horizon * 3
        if len(values) >= 28 + validation_days and not any(flags[-validation_days:]):
            start = len(values) - validation_days
            prefix = series.model_copy(update={"units": series.units[:start], "dates": series.dates[:start],
                                               "stockoutFlags": flags[:start] if flags else []})
            cost_candidate = _select_model(prefix, horizon, policy, False)
            wape_candidate = _select_model(prefix, horizon, None, False)
            actual_cycles = [values[end:end+horizon] for end in range(start, len(values), horizon)]
            if cost_candidate[1] == wape_candidate[1] == "ROLLING_BACKTEST" and all(sum(cycle) > 0 for cycle in actual_cycles):
                losses = [[], []]
                missed_totals = [0., 0.]
                for end, actual in zip(range(start, len(values), horizon), actual_cycles):
                    for index, candidate in enumerate((cost_candidate[0], wape_candidate[0])):
                        prediction = _normalise(values[:end], horizon, flags[:end], candidate)[0]
                        missed, exposure = _order_cycle_exposure(prediction, actual)
                        margin = series.unitPrice - series.unitCost
                        loss = missed * margin + exposure * series.unitCost * (policy.annualHoldingRate + policy.annualObsolescenceRate) / 365
                        loss += max(0., missed - (1-policy.serviceLevel)*sum(actual)) * margin
                        losses[index].append(loss)
                        missed_totals[index] += missed
                cost_score, baseline_score = sum(losses[0])/validation_days, sum(losses[1])/validation_days
                fill = 1 - missed_totals[0]/sum(values[-validation_days:])
                wins = sum(a < b for a, b in zip(losses[0], losses[1]))
                approved = cost_score < baseline_score and fill >= policy.serviceLevel and wins >= 2
                validation = {"status": "COST_VALIDATED" if approved else "BASELINE_RETAINED",
                              "costCandidate": cost_candidate[0], "baselineCandidate": wape_candidate[0],
                              "costCandidateCostPerDay": cost_score, "baselineCostPerDay": baseline_score,
                              "costCandidateFillRate": fill, "validationDays": float(validation_days), "winningCycles": float(wins)}
                if approved:
                    winner, metric = cost_candidate[0], "rolling_business_cost_validated_aud_per_day"
    return winner, "ROLLING_BACKTEST", scores, metric, cost_details, validation


def forecast(request: ForecastRequest) -> ForecastResponse:
    today = request.forecastStartDate or date.today()
    items: list[ForecastItem] = []
    # Target rows take precedence; overlapping references must not inflate the
    # three-donor threshold when a batch contains one of its own donors.
    donor_pool = {series.productId: series for series in request.referenceSeries}
    donor_pool.update({series.productId: series for series in request.series})
    analog_cache = {}
    for series in request.series:
        if series.selectedModel:
            model, selection_status, candidate_scores, metric, cost_details, validation = series.selectedModel, "EXPLICIT", {}, None, {}, {}
        else:
            model, selection_status, candidate_scores, metric, cost_details, validation = _select_model(series, min(request.horizonDays, 7), request.costPolicy)
        values, quality, confidence = _normalise(series.units, request.horizonDays, series.stockoutFlags, model)
        if selection_status in ("BLOCKED", "INSUFFICIENT_HISTORY"):
            confidence = "LOW"
        analog_count = 0
        analog_spread = 0.0
        if not series.selectedModel and series.isNew and len(series.units) < 28 and series.category and series.priceBand:
            cutoff = series.dates[-1] if series.dates else request.forecastStartDate or today
            key = (series.category, series.brand, series.priceBand, cutoff)
            if key not in analog_cache:
                donors = [other for other in donor_pool.values()
                          if not other.isNew and len(other.units) >= 28
                          and other.category == series.category and other.priceBand == series.priceBand
                          and (not series.brand or other.brand == series.brand)
                          and other.dates[-1] == cutoff
                          and sum(other.units[-28:]) > 0 and not any(other.stockoutFlags[-28:])]
                analog_cache[key] = (len(donors),
                                     median(mean(max(0.0, v) for v in donor.units[-28:]) for donor in donors) if len(donors) >= 3 else 0.0,
                                     pstdev(max(0.0, value) for donor in donors for value in donor.units[-28:]) if len(donors) >= 3 else 0.0)
            donor_count, donor_mean, donor_spread = analog_cache[key]
            if donor_count >= 3:
                analog_count = donor_count
                analog_spread = donor_spread
                values = [donor_mean] * request.horizonDays
                model, selection_status, metric = "analog_category_brand_price_v1", "ANALOG_COLD_START", None
                candidate_scores, cost_details, validation, quality, confidence = {}, {}, {}, "INSUFFICIENT_HISTORY", "LOW"
        usable_tail = [value for index, value in enumerate(series.units[-28:], start=max(0, len(series.units) - 28))
                       if not (index < len(series.stockoutFlags) and series.stockoutFlags[index])]
        spread = max(analog_spread, pstdev(usable_tail) if len(usable_tail) > 1 else 0.0)
        points = []
        for offset, p50 in enumerate(values, start=1):
            p80 = max(p50, p50 + 0.84 * spread)
            p90 = max(p80, p50 + 1.28 * spread)
            points.append(ForecastPoint(date=today + timedelta(days=offset), p50=p50, p80=p80, p90=p90))
        items.append(ForecastItem(productId=series.productId, model=model,
                                  selectionStatus=selection_status,
                                  selectionMetric=metric, analogCount=analog_count,
                                  candidateScores=candidate_scores, forecast=points,
                                  candidateBusinessCosts=cost_details,
                                  selectionValidation=validation,
                                  dataQuality=quality, confidence=confidence))
    return ForecastResponse(model="per_product_selected", modelVersion="5", sourceVersion=request.sourceVersion,
                            horizonDays=request.horizonDays, items=items, costPolicy=request.costPolicy,
                            costPolicySource="REQUEST_PLANNING_ASSUMPTIONS_REVIEW_REQUIRED" if "costPolicy" in request.model_fields_set else "DEFAULT_PLANNING_ASSUMPTIONS_REVIEW_REQUIRED")


def backtest(request: BacktestRequest) -> BacktestResponse:
    results: list[BacktestItem] = []
    for series in request.series:
        if len(series.units) <= request.horizonDays + 7:
            results.append(BacktestItem(productId=series.productId, wape=None, mae=None,
                                        bias=None, status="BLOCKED", dataQuality="INCOMPLETE",
                                        censoredDays=sum(series.stockoutFlags), evaluationCensoredDays=0,
                                        evaluationObservedDays=0))
            continue
        train = series.units[:-request.horizonDays]
        target_flags = series.stockoutFlags[-request.horizonDays:] if series.stockoutFlags else [False] * request.horizonDays
        target = list(zip(series.units[-request.horizonDays:], target_flags))
        observed_days = [(index, max(0.0, float(value))) for index, (value, censored) in enumerate(target)
                         if not censored]
        train_flags = series.stockoutFlags[:-request.horizonDays] if series.stockoutFlags else []
        predicted, quality, _ = _normalise(train, request.horizonDays, train_flags)
        evaluation_censored_days = sum(target_flags)
        if not observed_days:
            results.append(BacktestItem(productId=series.productId, wape=None, mae=None, bias=None,
                                        status="BLOCKED", dataQuality="CENSORED_DEMAND",
                                        censoredDays=sum(train_flags),
                                        evaluationCensoredDays=evaluation_censored_days,
                                        evaluationObservedDays=0))
            continue
        errors = [predicted[index] - actual for index, actual in observed_days]
        actual = [value for _, value in observed_days]
        denominator = sum(actual)
        wape = sum(abs(e) for e in errors) / denominator if denominator else None
        mae = sum(abs(e) for e in errors) / len(errors)
        bias = sum(errors) / len(errors)
        results.append(BacktestItem(productId=series.productId, wape=wape, mae=mae,
                                    bias=bias, status="PASS" if quality != "INCOMPLETE" else "BLOCKED",
                                    dataQuality=quality, censoredDays=sum(train_flags),
                                    evaluationCensoredDays=evaluation_censored_days,
                                    evaluationObservedDays=len(observed_days)))
    return BacktestResponse(model=MODEL, modelVersion="1", items=results)


def project_inventory(request: InventoryRequest) -> InventoryResponse:
    points: list[InventoryPoint] = []
    decisions: list[InventoryDecision] = []
    for item in request.items:
        running = item.onHand + item.onOrder
        average_demand = mean(max(0.0, point.p50) for point in item.forecast) if item.forecast else 0.0
        available_days = running / average_demand if average_demand > 0 else None
        coverage_days = item.leadTimeDays + item.safetyStockDays
        coverage_demand = average_demand * coverage_days
        recommended = max(0.0, coverage_demand - running)
        projected_after = running + recommended - average_demand * item.leadTimeDays
        post_replenishment_running = running + recommended
        expected_stockout_days = None
        if item.forecast:
            expected_stockout_days = 0
            for point in item.forecast:
                post_replenishment_running -= max(0.0, point.p50)
                if post_replenishment_running <= 0:
                    expected_stockout_days += 1
        reasons: list[str] = []
        if available_days is None:
            risk = "UNKNOWN"
            reasons.append("forecast_has_no_positive_demand")
        elif available_days <= item.leadTimeDays:
            risk = "HIGH"
            reasons.append("available_days_do_not_cover_lead_time")
        elif available_days <= coverage_days:
            risk = "MEDIUM"
            reasons.append("available_days_below_lead_time_plus_safety_stock")
        else:
            risk = "LOW"
            reasons.append("stock_covers_lead_time_and_safety_stock")
        if item.onOrder > 0:
            reasons.append("includes_on_order_quantity")
        if item.dataQuality != "VALID":
            reasons.append("inventory_data_quality_" + item.dataQuality.lower())
        decisions.append(InventoryDecision(
            productId=item.productId, risk=risk, availableDays=available_days,
            recommendedReplenishment=round(recommended, 4),
            projectedAfterReplenishment=round(projected_after, 4),
            expectedStockoutDaysAfterReplenishment=expected_stockout_days,
            confidence="HIGH" if item.dataQuality == "VALID" and average_demand > 0 else "LOW",
            reason=reasons, dataQuality=item.dataQuality,
        ))
        for point in item.forecast:
            running -= point.p50
            points.append(InventoryPoint(productId=item.productId, date=point.date,
                                         projectedOnHand=round(running, 4), stockout=running <= 0))
    return InventoryResponse(status="READ_ONLY", items=points, decisions=decisions)
