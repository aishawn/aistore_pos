from datetime import date, timedelta
from statistics import mean, pstdev

from .schemas import (BacktestItem, BacktestRequest, BacktestResponse,
                       ForecastItem, ForecastPoint, ForecastRequest, ForecastResponse,
                       InventoryPoint, InventoryRequest, InventoryResponse)


MODEL = "seasonal_naive_v1"


def _normalise(values: list[float], horizon: int) -> tuple[list[float], str, str]:
    clean = [max(0.0, float(value)) for value in values if value is not None]
    if not clean:
        return [0.0] * horizon, "INCOMPLETE", "LOW"
    if len(clean) < 14:
        return [mean(clean)] * horizon, "INSUFFICIENT_HISTORY", "LOW"
    # A seven-day seasonal baseline is robust, explainable, and deterministic.
    week = clean[-7:] if len(clean) >= 7 else clean
    baseline = week * ((horizon + len(week) - 1) // len(week))
    return baseline[:horizon], "VALID", "HIGH" if len(clean) >= 56 else "MEDIUM"


def forecast(request: ForecastRequest) -> ForecastResponse:
    today = request.forecastStartDate or date.today()
    items: list[ForecastItem] = []
    for series in request.series:
        values, quality, confidence = _normalise(series.units, request.horizonDays)
        spread = pstdev(series.units[-28:]) if len(series.units) > 1 else 0.0
        points = []
        for offset, p50 in enumerate(values, start=1):
            p80 = max(p50, p50 + 0.84 * spread)
            p90 = max(p80, p50 + 1.28 * spread)
            points.append(ForecastPoint(date=today + timedelta(days=offset), p50=p50, p80=p80, p90=p90))
        items.append(ForecastItem(productId=series.productId, forecast=points,
                                  dataQuality=quality, confidence=confidence))
    return ForecastResponse(model=MODEL, modelVersion="1", sourceVersion=request.sourceVersion,
                            horizonDays=request.horizonDays, items=items)


def backtest(request: BacktestRequest) -> BacktestResponse:
    results: list[BacktestItem] = []
    for series in request.series:
        if len(series.units) <= request.horizonDays + 7:
            results.append(BacktestItem(productId=series.productId, wape=None, mae=None,
                                        bias=None, status="BLOCKED"))
            continue
        train = series.units[:-request.horizonDays]
        actual = [max(0.0, float(x)) for x in series.units[-request.horizonDays:]]
        predicted, _, _ = _normalise(train, request.horizonDays)
        errors = [p - a for p, a in zip(predicted, actual)]
        denominator = sum(actual)
        wape = sum(abs(e) for e in errors) / denominator if denominator else None
        mae = sum(abs(e) for e in errors) / len(errors)
        bias = sum(errors) / len(errors)
        results.append(BacktestItem(productId=series.productId, wape=wape, mae=mae,
                                    bias=bias, status="PASS"))
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
