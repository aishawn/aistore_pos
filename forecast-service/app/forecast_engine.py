from datetime import date, timedelta
from statistics import mean, pstdev

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
        # A seven-day seasonal baseline is robust, explainable, and deterministic.
        week = clean[-7:] if len(clean) >= 7 else clean
        baseline = week * ((horizon + len(week) - 1) // len(week))
    quality = "CENSORED_DEMAND" if censored else "VALID"
    confidence = "LOW" if censored else ("HIGH" if len(clean) >= 56 else "MEDIUM")
    return baseline[:horizon], quality, confidence


def _select_model(series, horizon: int = 7) -> tuple[str, str, dict[str, float]]:
    """Select one model per product using rolling, uncensored WAPE.

    The service deliberately refuses to call a short series a validated model
    selection. The caller still receives a deterministic seasonal-naive
    forecast, but the response labels it as insufficient history.
    """
    values = [max(0.0, float(value)) for value in series.units]
    if len(values) < 28:
        return MODEL, "INSUFFICIENT_HISTORY", {}
    flags = series.stockoutFlags or []
    scores: dict[str, float] = {}
    for candidate in MODEL_NAMES:
        errors: list[float] = []
        actual_total = 0.0
        for end in range(14, len(values) - horizon + 1, horizon):
            train = values[:end]
            train_flags = flags[:end] if flags else []
            predicted, _, _ = _normalise(train, horizon, train_flags, candidate)
            for offset, actual in enumerate(values[end:end + horizon]):
                if end + offset < len(flags) and flags[end + offset]:
                    continue
                errors.append(abs(predicted[offset] - actual))
                actual_total += actual
        if errors and actual_total > 0:
            scores[candidate] = sum(errors) / actual_total
    if not scores:
        return MODEL, "BLOCKED", {}
    winner = min(scores, key=lambda candidate: (scores[candidate], candidate))
    return winner, "ROLLING_BACKTEST", scores


def forecast(request: ForecastRequest) -> ForecastResponse:
    today = request.forecastStartDate or date.today()
    items: list[ForecastItem] = []
    for series in request.series:
        if series.selectedModel:
            model, selection_status, candidate_scores = series.selectedModel, "EXPLICIT", {}
        else:
            model, selection_status, candidate_scores = _select_model(series, min(request.horizonDays, 7))
        values, quality, confidence = _normalise(series.units, request.horizonDays, series.stockoutFlags, model)
        usable_tail = [value for index, value in enumerate(series.units[-28:], start=max(0, len(series.units) - 28))
                       if not (index < len(series.stockoutFlags) and series.stockoutFlags[index])]
        spread = pstdev(usable_tail) if len(usable_tail) > 1 else 0.0
        points = []
        for offset, p50 in enumerate(values, start=1):
            p80 = max(p50, p50 + 0.84 * spread)
            p90 = max(p80, p50 + 1.28 * spread)
            points.append(ForecastPoint(date=today + timedelta(days=offset), p50=p50, p80=p80, p90=p90))
        items.append(ForecastItem(productId=series.productId, model=model,
                                  selectionStatus=selection_status,
                                  selectionMetric="rolling_wape" if candidate_scores else None,
                                  candidateScores=candidate_scores, forecast=points,
                                  dataQuality=quality, confidence=confidence))
    return ForecastResponse(model="per_product_selected", modelVersion="2", sourceVersion=request.sourceVersion,
                            horizonDays=request.horizonDays, items=items)


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
