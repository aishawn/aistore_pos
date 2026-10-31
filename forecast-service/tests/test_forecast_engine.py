from datetime import date, timedelta
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.forecast_engine import backtest, forecast, project_inventory
from app.schemas import (BacktestRequest, ForecastPoint, ForecastRequest,
                         InventoryItem, InventoryRequest, Series)


def make_series(evaluation_flags: list[bool]) -> Series:
    start = date(2026, 1, 1)
    return Series(
        productId=1,
        dates=[start + timedelta(days=index) for index in range(15)],
        units=[4.0] * 15,
        stockoutFlags=[False] * 12 + evaluation_flags,
    )


class ForecastBacktestTests(unittest.TestCase):
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
        self.assertIn("available_days_do_not_cover_lead_time", decision.reason)

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
