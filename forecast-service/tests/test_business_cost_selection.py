from datetime import date, timedelta
from pathlib import Path
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.forecast_engine import _normalise, _order_cycle_exposure, _select_wape_candidate, forecast
from app.schemas import ForecastRequest, InventoryCostPolicy, Series


def series(units, **kwargs):
    return Series(productId=kwargs.pop("productId", 1), dates=[date(2026, 1, 1)+timedelta(days=i) for i in range(len(units))], units=units, **kwargs)


def test_inventory_carries_between_days_and_counts_each_lost_unit_once():
    assert _order_cycle_exposure([2, 2, 2], [0, 0, 6]) == (0, 12)
    assert _order_cycle_exposure([1, 1, 1], [0, 5, 5]) == (7, 3)
    assert _order_cycle_exposure([0, 0], [0, 0]) == (0, 0)


def test_cost_components_match_hand_calculated_inventory_unit_days():
    item = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
        series=[series([0, 0, 0, 1, 0, 0, 12]*8, unitCost=10, unitPrice=30)])).items[0]
    score = item.candidateBusinessCosts["moving_average_7_v1"]
    # Stock closes at 13,13,13,12,12,12,0 in each observed cycle.
    assert score.lostMarginPerDay == score.servicePenaltyPerDay == 0
    assert score.holdingCostPerDay == pytest.approx(75*10*.25/365/7)
    assert score.obsolescenceCostPerDay == pytest.approx(75*10*.10/365/7)
    assert score.totalCostPerDay == pytest.approx(score.holdingCostPerDay+score.obsolescenceCostPerDay)
    assert score.fillRate == 1
    assert score.evaluatedFolds == 6 and score.evaluatedDays == 42


def test_long_history_model_selection_uses_only_six_recent_weekly_folds():
    item = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
        series=[series([4, 5, 6, 7, 8, 9, 10] * 18, unitCost=10, unitPrice=30)])).items[0]

    assert item.selectionStatus == "ROLLING_BACKTEST"
    assert item.candidateBusinessCosts
    assert {score.evaluatedFolds for score in item.candidateBusinessCosts.values()} == {6}


def test_very_long_history_records_an_independent_wape_validation_slice():
    item = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
        series=[series([1.0] * 180)])).items[0]

    assert item.selectionValidation["validationDays"] == 21
    assert item.selectionValidation["status"] in {"WAPE_VALIDATED", "BASELINE_RETAINED"}


def test_wape_selection_keeps_baseline_without_a_material_validation_gain():
    assert _select_wape_candidate({"two_stage_occurrence_v1": 0.80, "seasonal_naive_v1": 0.74}) == "two_stage_occurrence_v1"
    assert _select_wape_candidate({"two_stage_occurrence_v1": 0.80, "seasonal_naive_v1": 0.72}) == "seasonal_naive_v1"


def test_margin_and_capital_policy_change_model_and_service_tradeoff():
    units = [3,3,0,1,8,3,3,1,3,1,8,0,8,0,1,0,0,8,1,8,8,0,1,0,0,1,3,8,0,1,3,1,8,0,8,3,3,8,1,0,8,0,0,3,0,8,3,1,0,1,0,0,8,0,0,0]
    def run(price, holding, obsolete, service):
        return forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
            costPolicy=InventoryCostPolicy(annualHoldingRate=holding, annualObsolescenceRate=obsolete, serviceLevel=service),
            series=[series(units, unitCost=10, unitPrice=price)])).items[0]
    capital = run(10.01, 2, 1, .8)
    service = run(30, .25, .1, .99)
    assert min(capital.candidateScores, key=lambda name: (capital.candidateScores[name], name)) == "moving_average_7_v1"
    assert capital.selectionValidation["status"] == "BASELINE_RETAINED"
    assert service.model == "exponential_smoothing_v1"
    assert service.selectionValidation["status"] == "COST_VALIDATED"
    assert service.selectionValidation["validationDays"] == 21
    assert service.selectionValidation["winningCycles"] >= 2
    assert service.candidateBusinessCosts[service.model].fillRate > capital.candidateBusinessCosts[capital.model].fillRate
    for item in (capital, service):
        for model, score in item.candidateBusinessCosts.items():
            assert score.totalCostPerDay == pytest.approx(sum([score.lostMarginPerDay, score.holdingCostPerDay, score.obsolescenceCostPerDay, score.servicePenaltyPerDay]))
            assert score.totalCostPerDay == item.candidateScores[model]


def test_censored_cycle_is_not_claimed_as_observed_cost_evidence():
    flags = [False]*56
    flags[14] = True
    item = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
        series=[series([2]*56, unitCost=10, unitPrice=20, stockoutFlags=flags)])).items[0]
    assert item.candidateBusinessCosts[item.model].evaluatedDays == 35
    assert item.confidence == "LOW"


def test_censoring_preserves_weekday_alignment():
    flags = [False]*56
    flags[-2] = True
    values, quality, confidence = _normalise([1,2,3,4,5,6,7]*8, 7, flags)
    assert values == [1,2,3,4,5,6,7]
    assert quality == "CENSORED_DEMAND" and confidence == "LOW"


def test_cost_candidates_are_fixed_before_validation_and_sparse_validation_falls_back():
    prefix = [3,3,0,1,8,3,3,1,3,1,8,0,8,0,1,0,0,8,1,8,8,0,1,0,0,1,3,8,0,1,3,1,8,0,8]
    def run(tail):
        return forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7,
            series=[series(prefix+tail, unitCost=10, unitPrice=25)])).items[0]
    a, b = run([1]*21), run([80]*21)
    assert a.selectionValidation["costCandidate"] == b.selectionValidation["costCandidate"]
    assert a.selectionValidation["baselineCandidate"] == b.selectionValidation["baselineCandidate"]
    sparse = run([1]*7+[0]*7+[1]*7)
    assert sparse.selectionMetric == "rolling_horizon_total_wape_cost_validation_fallback"
    assert sparse.selectionValidation["status"] == "INSUFFICIENT_UNCENSORED_VALIDATION"


@pytest.mark.parametrize("units,dates", [([1], []), ([1, 2], [date(2026,1,1),date(2026,1,3)]),
    ([1, 2], [date(2026,1,1),date(2026,1,1)]), ([float("nan")], [date(2026,1,1)]), ([float("inf")], [date(2026,1,1)])])
def test_invalid_daily_series_is_rejected_instead_of_silently_shifting_dates(units, dates):
    with pytest.raises(ValidationError):
        Series(productId=1, units=units, dates=dates)


def test_analogs_exclude_future_or_stale_periods_and_preserve_explicit_model():
    donors = [series([i]*56, productId=i, category="wine", brand="b", priceBand="mid") for i in (1,2,3)]
    new = Series(productId=4, dates=donors[0].dates[-7:], units=[0]*7, isNew=True, category="wine", brand="b", priceBand="mid")
    def run():
        return forecast(ForecastRequest(vendorId=1, outletId=1, series=donors+[new])).items[-1]
    assert run().analogCount == 3
    donors[0].dates = [d+timedelta(days=1) for d in donors[0].dates]
    assert run().analogCount == 0
    donors[0].dates = [d-timedelta(days=2) for d in donors[0].dates]
    assert run().analogCount == 0
    donors[0].dates = donors[1].dates.copy()
    new.selectedModel = "moving_average_7_v1"
    assert run().model == "moving_average_7_v1"
    assert run().selectionStatus == "EXPLICIT"
