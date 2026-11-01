from datetime import date, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.forecast_engine import backtest, backtest_inventory, forecast, project_inventory
from app.schemas import (BacktestRequest, ForecastPoint, ForecastRequest,
                         InventoryBacktestRequest, InventoryBacktestSeries, InventoryItem, InventoryRequest, Series)


def make_series(evaluation_flags: list[bool]) -> Series:
    start = date(2026, 1, 1)
    return Series(
        productId=1,
        dates=[start + timedelta(days=index) for index in range(15)],
        units=[4.0] * 15,
        stockoutFlags=[False] * 12 + evaluation_flags,
    )


class ForecastBacktestTests(unittest.TestCase):
    def test_inventory_backtest_uses_future_on_hand_only_for_scoring(self):
        start = date(2026, 1, 1)
        days = 42
        result = backtest_inventory(InventoryBacktestRequest(vendorId=1, outletId=1, horizonDays=7,
            minHistoryDays=28, series=[InventoryBacktestSeries(
                productId=1,
                dates=[start + timedelta(days=index) for index in range(days)],
                units=[2.0] * days,
                onHand=[max(0.0, 60.0 - 2.0 * index) for index in range(days)],
                receipts=[0.0] * days,
            )]))
        item = result.items[0]
        self.assertEqual("PASS", item.status)
        self.assertGreater(item.origins, 0)
        self.assertFalse(item.futureObservationsUsedAsInput)
        self.assertIn("evaluation-only", item.note)

    def test_inventory_backtest_blocks_short_history(self):
        start = date(2026, 1, 1)
        result = backtest_inventory(InventoryBacktestRequest(vendorId=1, outletId=1, horizonDays=7,
            minHistoryDays=28, series=[InventoryBacktestSeries(
                productId=1, dates=[start + timedelta(days=index) for index in range(30)],
                units=[1.0] * 30, onHand=[10.0] * 30)]))
        self.assertEqual("BLOCKED", result.items[0].status)
    def test_inventory_projection_returns_read_only_replenishment_decision(self):
        start = date(2026, 1, 1)
        forecast_points = [ForecastPoint(date=start + timedelta(days=index), p50=2, p80=3, p90=4)
                           for index in range(7)]
        result = project_inventory(InventoryRequest(vendorId=1, outletId=1, items=[
            InventoryItem(productId=1, onHand=4, onOrder=0, forecast=forecast_points,
                          leadTimeDays=3, safetyStockDays=2, dataQuality="VALID")
        ]))
        self.assertEqual("READ_ONLY", result.status)
        decision = result.decisions[0]
        self.assertEqual("HIGH", decision.risk)
        self.assertEqual(2.0, decision.availableDays)
        self.assertEqual(6.0, decision.recommendedReplenishment)
        self.assertEqual(3, decision.expectedStockoutDaysAfterReplenishment)
        self.assertIn("available_days_do_not_cover_lead_time", decision.reason)

    def test_inventory_projection_reports_post_replenishment_stockout_days(self):
        start = date(2026, 1, 1)
        forecast_points = [ForecastPoint(date=start + timedelta(days=index), p50=5, p80=6, p90=7)
                           for index in range(7)]
        result = project_inventory(InventoryRequest(vendorId=1, outletId=1, items=[
            InventoryItem(productId=1, onHand=1, onOrder=0, forecast=forecast_points,
                          leadTimeDays=0, safetyStockDays=8, dataQuality="VALID")
        ]))
        decision = result.decisions[0]
        self.assertEqual(39.0, decision.recommendedReplenishment)
        self.assertEqual(0, decision.expectedStockoutDaysAfterReplenishment)

    def test_forecast_uses_the_model_selected_for_each_product(self):
        request = ForecastRequest(vendorId=1, outletId=1, horizonDays=3, series=[
            Series(productId=1, selectedModel="moving_average_7_v1",
                   dates=[date(2026, 1, 1) + timedelta(days=index) for index in range(15)],
                   units=[1.0] * 15),
            Series(productId=2, selectedModel="croston_sba_v1",
                   dates=[date(2026, 1, 1) + timedelta(days=index) for index in range(15)],
                   units=[0.0, 0.0, 4.0] * 5),
        ])
        result = forecast(request)
        self.assertEqual("per_product_selected", result.model)
        self.assertEqual("moving_average_7_v1", result.items[0].model)
        self.assertEqual("croston_sba_v1", result.items[1].model)

        tsb = ForecastRequest(vendorId=1, outletId=1, horizonDays=3, series=[
            Series(productId=3, selectedModel="tsb_v1",
                   dates=[date(2026, 1, 1) + timedelta(days=index) for index in range(15)],
                   units=[0.0, 0.0, 5.0] * 5),
        ])
        self.assertEqual("tsb_v1", forecast(tsb).items[0].model)

        two_stage = ForecastRequest(vendorId=1, outletId=1, horizonDays=3, series=[
            Series(productId=4, selectedModel="two_stage_occurrence_v1",
                   dates=[date(2026, 1, 1) + timedelta(days=index) for index in range(16)],
                   units=[0.0, 0.0, 0.0, 4.0] * 4),
        ])
        self.assertEqual("two_stage_occurrence_v1", forecast(two_stage).items[0].model)

    def test_forecast_selects_a_model_per_product_when_history_is_sufficient(self):
        start = date(2026, 1, 1)
        weekly = [1.0, 1.0, 1.0, 1.0, 1.0, 8.0, 10.0] * 8
        result = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7, series=[
            Series(productId=10,
                   dates=[start + timedelta(days=index) for index in range(len(weekly))],
                   units=weekly),
        ]))
        item = result.items[0]
        self.assertEqual("ROLLING_BACKTEST", item.selectionStatus)
        self.assertIn(item.model, {"seasonal_naive_v1", "moving_average_7_v1", "exponential_smoothing_v1",
                                    "croston_sba_v1", "tsb_v1", "two_stage_occurrence_v1"})
        self.assertTrue(item.candidateScores)
        self.assertEqual("rolling_horizon_total_wape", item.selectionMetric)

    def test_forecast_labels_short_history_without_claiming_model_selection(self):
        start = date(2026, 1, 1)
        result = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7, series=[
            Series(productId=11,
                   dates=[start + timedelta(days=index) for index in range(14)],
                   units=[1.0] * 14),
        ]))
        item = result.items[0]
        self.assertEqual("INSUFFICIENT_HISTORY", item.selectionStatus)
        self.assertEqual({}, item.candidateScores)

    def test_zero_demand_never_claims_high_confidence(self):
        start = date(2026, 1, 1)
        result = forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7, series=[
            Series(productId=12, dates=[start + timedelta(days=i) for i in range(56)], units=[0.0] * 56),
        ]))
        self.assertEqual("BLOCKED", result.items[0].selectionStatus)
        self.assertEqual("LOW", result.items[0].confidence)

    def test_valid_costs_switch_selection_metric_and_costs_respond_to_margin(self):
        dates = [date(2026, 1, 1) + timedelta(days=i) for i in range(56)]
        def run(price):
            return forecast(ForecastRequest(vendorId=1, outletId=1, horizonDays=7, series=[
                Series(productId=1, dates=dates, units=[0., 0., 0., 1., 0., 0., 12.] * 8, unitCost=10, unitPrice=price),
            ])).items[0]
        low, high = run(11), run(30)
        self.assertEqual("rolling_horizon_total_wape_cost_validation_fallback", high.selectionMetric)
        self.assertGreater(high.candidateScores["tsb_v1"], low.candidateScores["tsb_v1"])
        self.assertEqual(high.candidateScores["moving_average_7_v1"], low.candidateScores["moving_average_7_v1"])
        self.assertEqual(0, high.candidateBusinessCosts["moving_average_7_v1"].lostMarginPerDay)
        self.assertEqual(min(high.candidateScores.values()), high.candidateScores[high.model])

    def test_new_product_analogs_require_matching_category_brand_and_price_band(self):
        dates = [date(2026, 1, 1) + timedelta(days=i) for i in range(56)]
        donors = [Series(productId=i, dates=dates, units=[float(i)] * 56,
                         category="wine", brand="example", priceBand="mid") for i in (1, 2, 3)]
        new = Series(productId=4, dates=dates[-7:], units=[0.] * 7, isNew=True,
                     category="wine", brand="example", priceBand="mid")
        request = ForecastRequest(vendorId=1, outletId=1, horizonDays=7, series=donors + [new])
        item = forecast(request).items[-1]
        self.assertEqual("ANALOG_COLD_START", item.selectionStatus)
        self.assertEqual(3, item.analogCount)
        self.assertEqual(2., item.forecast[0].p50)
        self.assertEqual("LOW", item.confidence)
        new.brand = "different"
        self.assertNotEqual("ANALOG_COLD_START", forecast(request).items[-1].selectionStatus)

    def test_batches_preserve_full_analog_pool_and_return_targets_only(self):
        dates = [date(2026, 1, 1) + timedelta(days=i) for i in range(56)]
        donors = [Series(productId=i, dates=dates, units=[float(i)] * 56,
                         category="wine", brand="example", priceBand="mid") for i in (1, 2, 3)]
        new = Series(productId=4, dates=dates[-7:], units=[0.] * 7, isNew=True,
                     category="wine", brand="example", priceBand="mid")
        full = forecast(ForecastRequest(vendorId=1, outletId=1, series=donors + [new]))
        batched = forecast(ForecastRequest(vendorId=1, outletId=1, series=[new], referenceSeries=donors))
        self.assertEqual([full.items[-1]], batched.items)
        overlap = forecast(ForecastRequest(vendorId=1, outletId=1, series=[donors[0], new], referenceSeries=donors))
        self.assertEqual(full.items[-1], overlap.items[-1])
        self.assertEqual(3, overlap.items[-1].analogCount)
        too_few = forecast(ForecastRequest(vendorId=1, outletId=1, series=[donors[0], new], referenceSeries=donors[:2]))
        self.assertNotEqual("ANALOG_COLD_START", too_few.items[-1].selectionStatus)

    def test_scores_only_observed_days_when_evaluation_period_is_censored(self):
        result = backtest(BacktestRequest(horizonDays=3, series=[make_series([True, False, False])]))
        item = result.items[0]

        self.assertEqual("PASS", item.status)
        self.assertEqual(1, item.evaluationCensoredDays)
        self.assertEqual(2, item.evaluationObservedDays)
        self.assertEqual(0, item.wape)
        self.assertEqual(0, item.mae)
        self.assertEqual(0, item.bias)

    def test_blocks_fully_censored_evaluation_period(self):
        result = backtest(BacktestRequest(horizonDays=3, series=[make_series([True, True, True])]))
        item = result.items[0]

        self.assertEqual("BLOCKED", item.status)
        self.assertEqual("CENSORED_DEMAND", item.dataQuality)
        self.assertEqual(0, item.evaluationObservedDays)
        self.assertIsNone(item.wape)
