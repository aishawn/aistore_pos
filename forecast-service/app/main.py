from fastapi import FastAPI

from .forecast_engine import backtest, forecast, project_inventory
from .schemas import (BacktestRequest, BacktestResponse, ForecastRequest, ForecastResponse,
                       InventoryRequest, InventoryResponse)

app = FastAPI(title="Orithos Forecast Service", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "UP", "service": "forecast-service"}


@app.post("/v1/forecast/sales", response_model=ForecastResponse)
def sales_forecast(request: ForecastRequest) -> ForecastResponse:
    return forecast(request)


@app.post("/v1/forecast/demand", response_model=ForecastResponse)
def demand_forecast(request: ForecastRequest) -> ForecastResponse:
    return forecast(request)


@app.post("/v1/backtest", response_model=BacktestResponse)
def run_backtest(request: BacktestRequest) -> BacktestResponse:
    return backtest(request)


@app.post("/v1/forecast/inventory", response_model=InventoryResponse)
def inventory_forecast(request: InventoryRequest) -> InventoryResponse:
    return project_inventory(request)
