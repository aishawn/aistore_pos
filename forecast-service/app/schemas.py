from datetime import date, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class Series(BaseModel):
    productId: int = Field(gt=0)
    category: str | None = None
    brand: str | None = None
    priceBand: str | None = None
    isNew: bool = False
    unitCost: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    unitPrice: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    stockoutDataQuality: str | None = None
    selectedModel: Literal["seasonal_naive_v1", "moving_average_7_v1",
                           "exponential_smoothing_v1", "croston_sba_v1", "tsb_v1",
                           "two_stage_occurrence_v1"] | None = None
    dates: list[date]
    units: list[Annotated[float, Field(allow_inf_nan=False)]]
    stockoutFlags: list[bool] = []

    @model_validator(mode="after")
    def validate_alignment(self):
        if len(self.dates) != len(self.units):
            raise ValueError("dates and units must have the same length")
        if any(current != previous + timedelta(days=1) for previous, current in zip(self.dates, self.dates[1:])):
            raise ValueError("dates must be unique consecutive daily observations")
        if self.stockoutFlags and len(self.stockoutFlags) != len(self.units):
            raise ValueError("stockoutFlags and units must have the same length")
        return self


class InventoryCostPolicy(BaseModel):
    # Explicit planning assumptions, not measured merchant financing/spoilage costs.
    annualHoldingRate: float = Field(default=0.25, ge=0, le=2)
    annualObsolescenceRate: float = Field(default=0.10, ge=0, le=1)
    serviceLevel: float = Field(default=0.90, gt=0, lt=1)


class ForecastRequest(BaseModel):
    vendorId: int = Field(gt=0)
    outletId: int = Field(gt=0)
    horizonDays: int = Field(default=14, ge=1, le=90)
    sourceVersion: str = "unknown"
    forecastStartDate: date | None = None
    costPolicy: InventoryCostPolicy = Field(default_factory=InventoryCostPolicy)
    series: list[Series] = Field(min_length=1, max_length=2000)


class ForecastPoint(BaseModel):
    date: date
    p50: float = Field(ge=0)
    p80: float = Field(ge=0)
    p90: float = Field(ge=0)


class BusinessCostScore(BaseModel):
    lostMarginPerDay: float
    holdingCostPerDay: float
    obsolescenceCostPerDay: float
    servicePenaltyPerDay: float
    totalCostPerDay: float
    fillRate: float
    evaluatedDays: int
    evaluatedFolds: int


class ForecastItem(BaseModel):
    productId: int
    model: str = "seasonal_naive_v1"
    selectionStatus: Literal["EXPLICIT", "ROLLING_BACKTEST", "INSUFFICIENT_HISTORY", "BLOCKED", "ANALOG_COLD_START"] = "INSUFFICIENT_HISTORY"
    selectionMetric: str | None = None
    candidateScores: dict[str, float] = Field(default_factory=dict)
    candidateBusinessCosts: dict[str, BusinessCostScore] = Field(default_factory=dict)
    selectionValidation: dict[str, float | str] = Field(default_factory=dict)
    analogCount: int = 0
    forecast: list[ForecastPoint]
    dataQuality: Literal["VALID", "INSUFFICIENT_HISTORY", "INCOMPLETE", "CENSORED_DEMAND"]
    confidence: Literal["HIGH", "MEDIUM", "LOW"]


class ForecastResponse(BaseModel):
    model: str
    modelVersion: str
    sourceVersion: str
    horizonDays: int
    items: list[ForecastItem]
    costPolicy: InventoryCostPolicy | None = None
    costPolicySource: str = "DEFAULT_PLANNING_ASSUMPTIONS_REVIEW_REQUIRED"
    businessCostBasis: str = "SIMULATED_ORDER_CYCLE_ZERO_OPENING_STOCK_IMMEDIATE_DELIVERY_NOT_REALIZED_SAVINGS"


class BacktestRequest(BaseModel):
    series: list[Series] = Field(min_length=1, max_length=2000)
    horizonDays: int = Field(default=7, ge=1, le=28)


class BacktestItem(BaseModel):
    productId: int
    wape: float | None
    mae: float | None
    bias: float | None
    status: Literal["PASS", "BLOCKED"]
    dataQuality: Literal["VALID", "CENSORED_DEMAND", "INSUFFICIENT_HISTORY", "INCOMPLETE"] = "VALID"
    censoredDays: int = 0
    evaluationCensoredDays: int = 0
    evaluationObservedDays: int = 0


class BacktestResponse(BaseModel):
    model: str
    modelVersion: str
    items: list[BacktestItem]


class InventoryItem(BaseModel):
    productId: int = Field(gt=0)
    onHand: float = Field(ge=0)
    onOrder: float = Field(default=0, ge=0)
    forecast: list[ForecastPoint]
    leadTimeDays: int = Field(default=0, ge=0, le=90)
    safetyStockDays: int = Field(default=3, ge=0, le=90)
    dataQuality: str = "UNKNOWN"


class InventoryRequest(BaseModel):
    vendorId: int = Field(gt=0)
    outletId: int = Field(gt=0)
    items: list[InventoryItem] = Field(min_length=1, max_length=2000)


class InventoryPoint(BaseModel):
    productId: int
    date: date
    projectedOnHand: float
    stockout: bool


class InventoryDecision(BaseModel):
    productId: int
    risk: Literal["LOW", "MEDIUM", "HIGH", "UNKNOWN"]
    availableDays: float | None
    recommendedReplenishment: float
    projectedAfterReplenishment: float
    expectedStockoutDaysAfterReplenishment: int | None = None
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    reason: list[str]
    dataQuality: str


class InventoryResponse(BaseModel):
    status: Literal["READ_ONLY"]
    items: list[InventoryPoint]
    decisions: list[InventoryDecision] = []
