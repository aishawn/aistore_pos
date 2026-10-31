import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError

from .forecast_engine import backtest, forecast, project_inventory
from .schemas import (BacktestRequest, BacktestResponse, ForecastRequest, ForecastResponse,
                       InventoryRequest, InventoryResponse)

app = FastAPI(title="Orithos Forecast Service", version="1.0.0")
log = logging.getLogger(__name__)


@app.exception_handler(RequestValidationError)
async def log_request_validation_error(request: Request, error: RequestValidationError):
    if request.url.path.startswith("/v1/forecast/"):
        try:
            body_size = len(await request.body())
        except Exception:
            body_size = -1
        error_paths = [
            ".".join(str(part) for part in item.get("loc", ())) + ":" + str(item.get("type", "unknown"))
            for item in error.errors()[:12]
        ]
        log.warning(
            "Forecast request validation failed path=%s contentLength=%s bodyBytes=%s contentType=%s errors=%s",
            request.url.path,
            request.headers.get("content-length", "missing"),
            body_size,
            request.headers.get("content-type", "missing"),
            ",".join(error_paths),
        )
    return await request_validation_exception_handler(request, error)


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
