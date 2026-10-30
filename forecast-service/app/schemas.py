from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class Series(BaseModel):
    productId: int = Field(gt=0)
    dates: list[date]
    units: list[float]
    stockoutFlags: list[bool] = []


class ForecastRequest(BaseModel):
    vendorId: int = Field(gt=0)
    outletId: int = Field(gt=0)
    horizonDays: int = Field(default=14, ge=1, le=90)
    sourceVersion: str = "unknown"
    forecastStartDate: date | None = None
    series: list[Series] = Field(min_length=1, max_length=2000)


class ForecastPoint(BaseModel):
    date: date
    p50: float = Field(ge=0)
    p80: float = Field(ge=0)
    p90: float = Field(ge=0)


class ForecastItem(BaseModel):
    productId: int
    forecast: list[ForecastPoint]
    dataQuality: Literal["VALID", "INSUFFICIENT_HISTORY", "INCOMPLETE"]
    confidence: Literal["HIGH", "MEDIUM", "LOW"]


class ForecastResponse(BaseModel):
    model: str
    modelVersion: str
    sourceVersion: str
    horizonDays: int
    items: list[ForecastItem]


class BacktestRequest(BaseModel):
    series: list[Series] = Field(min_length=1, max_length=2000)
    horizonDays: int = Field(default=7, ge=1, le=28)


class BacktestItem(BaseModel):
    productId: int
    wape: float | None
    mae: float | None
    bias: float | None
    status: Literal["PASS", "BLOCKED"]


class BacktestResponse(BaseModel):
    model: str
    modelVersion: str
    items: list[BacktestItem]


class InventoryItem(BaseModel):
    productId: int = Field(gt=0)
    onHand: float = Field(ge=0)
    onOrder: float = Field(default=0, ge=0)
    forecast: list[ForecastPoint]


class InventoryRequest(BaseModel):
    vendorId: int = Field(gt=0)
    outletId: int = Field(gt=0)
    items: list[InventoryItem] = Field(min_length=1, max_length=2000)


class InventoryPoint(BaseModel):
    productId: int
    date: date
    projectedOnHand: float
    stockout: bool


class InventoryResponse(BaseModel):
    status: Literal["READ_ONLY"]
    items: list[InventoryPoint]
