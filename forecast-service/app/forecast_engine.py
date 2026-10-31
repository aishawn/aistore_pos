from datetime import date, timedelta
from statistics import mean, pstdev

from .schemas import (BacktestItem, BacktestRequest, BacktestResponse,
                       ForecastItem, ForecastPoint, ForecastRequest, ForecastResponse,
                       InventoryPoint, InventoryRequest, InventoryResponse)


MODEL = "seasonal_naive_v1"


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
    else:
        # A seven-day seasonal baseline is robust, explainable, and deterministic.
        week = clean[-7:] if len(clean) >= 7 else clean
        baseline = week * ((horizon + len(week) - 1) // len(week))
    quality = "CENSORED_DEMAND" if censored else "VALID"
    confidence = "LOW" if censored else ("HIGH" if len(clean) >= 56 else "MEDIUM")
    return baseline[:horizon], quality, confidence


def forecast(request: ForecastRequest) -> ForecastResponse:
    today = request.forecastStartDate or date.today()
    items: list[ForecastItem] = []
    for series in request.series:
        model = series.selectedModel or MODEL
        values, quality, confidence = _normalise(series.units, request.horizonDays, series.stockoutFlags, model)
        usable_tail = [value for index, value in enumerate(series.units[-28:], start=max(0, len(series.units) - 28))
                       if not (index < len(series.stockoutFlags) and series.stockoutFlags[index])]
        spread = pstdev(usable_tail) if len(usable_tail) > 1 else 0.0
        points = []
        for offset, p50 in enumerate(values, start=1):
            p80 = max(p50, p50 + 0.84 * spread)
            p90 = max(p80, p50 + 1.28 * spread)
            points.append(ForecastPoint(date=today + timedelta(days=offset), p50=p50, p80=p80, p90=p90))
        items.append(ForecastItem(productId=series.productId, model=model, forecast=points,
                                  dataQuality=quality, confidence=confidence))
    return ForecastResponse(model="per_product_selected", modelVersion="1", sourceVersion=request.sourceVersion,
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
    for item in request.items:
        running = item.onHand + item.onOrder
        for point in item.forecast:
            running -= point.p50
            points.append(InventoryPoint(productId=item.productId, date=point.date,
                                         projectedOnHand=round(running, 4), stockout=running <= 0))
    return InventoryResponse(status="READ_ONLY", items=points)
