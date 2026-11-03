import unittest
from collections import Counter
from types import SimpleNamespace
from unittest.mock import patch
from datetime import date, datetime, timedelta
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "forecast-service"))

from app.forecast_engine import MODEL_NAMES
from app.schemas import Series
from scripts.ai_forecast_walkforward_eval import (
    _demand_segment, _metric_summary, _score_fold, evaluate, walk_forward_origins,
)
from scripts.ai_forecast_eval import require_native_inventory_event_times


def snapshots(future_demand: float):
    dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(35)]
    sales = {
        "companyId": 5,
        "writeRequests": [],
        "series": [{
            "productId": product_id,
            "dates": [day.isoformat() for day in dates],
            "units": [1.0] * 28 + [future_demand] * 7,
            "stockoutFlags": [],
        } for product_id in (7, 8)],
    }
    inventory = {
        "source": "odoo-readonly-jsonrpc",
        "dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS",
        "businessTimezone": "Australia/Adelaide",
        "writeRequests": [],
        "qualityWarnings": [],
        "products": [{
            "productId": product_id,
            "observations": [{
                "date": day.isoformat(),
                "capturedAt": datetime.combine(day, datetime.min.time().replace(hour=12)).isoformat() + "+10:30",
                "dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS",
                "availableQty": 0 if product_id == 7 and index == 28 else 5,
                "isStockout": product_id == 7 and index == 28,
            } for index, day in enumerate(dates)],
        } for product_id in (7, 8)],
    }
    return sales, inventory


class WalkForwardForecastTests(unittest.TestCase):
    def test_native_inventory_event_time_and_stockout_labels_are_required(self):
        _, inventory = snapshots(1.0)
        require_native_inventory_event_times(inventory)

        reconstructed = {**inventory, "dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE"}
        with self.assertRaisesRegex(ValueError, "native Odoo daily inventory snapshots"):
            evaluate(snapshots(1.0)[0], reconstructed, [7])

        missing_time = {**inventory, "products": [{
            **inventory["products"][0],
            "observations": [{**row, "capturedAt": None}
                             for row in inventory["products"][0]["observations"]],
        }]}
        with self.assertRaisesRegex(ValueError, "valid capturedAt"):
            require_native_inventory_event_times(missing_time)

    def test_folds_are_chronological_and_non_overlapping(self):
        self.assertEqual([28, 35, 42, 49], walk_forward_origins(56, 7, 28))
        origins = walk_forward_origins(56, 7, 28)
        for left, right in zip(origins, origins[1:]):
            self.assertEqual(left + 7, right)

    def test_stockout_days_are_excluded_and_future_sales_do_not_select_the_model(self):
        low_sales, inventory = snapshots(1.0)
        high_sales, _ = snapshots(10.0)

        low = evaluate(low_sales, inventory, [7])
        high = evaluate(high_sales, inventory, [7])

        low_summary = low["horizons"][0]["metrics"]["selected"]
        high_summary = high["horizons"][0]["metrics"]["selected"]
        self.assertEqual(1, low_summary["censoredDaysExcluded"])
        self.assertEqual(13, low_summary["observedDays"])
        self.assertEqual(low_summary["selectedModelCounts"], high_summary["selectedModelCounts"])
        self.assertTrue(set(low_summary["selectedModelCounts"]).issubset(set(MODEL_NAMES)))
        self.assertEqual("2026-01-28", low["horizons"][0]["foldScheduleSample"][0]["trainEnd"])
        self.assertEqual("2026-01-29", low["horizons"][0]["foldScheduleSample"][0]["evaluationStart"])
        self.assertEqual([], low["writeRequests"])
        self.assertEqual("PASS", low["status"])
        self.assertEqual("historical_stockout_labels_applied_to_sales_series_before_each_fold",
                         low["inventoryLabelMethod"])
        self.assertEqual(
            "training_labels_through_cutoff; holdout_stockout_labels_only_mask_censored_actuals_during_scoring",
            low["inventoryLabelUse"],
        )
        self.assertFalse(low["holdoutInventoryLabelsUsedAsForecastFeatures"])
        self.assertFalse(low["requiresFutureNativeInventoryObservations"])

    def test_changing_holdout_stockout_labels_does_not_change_forecast_inputs(self):
        sales, inventory = snapshots(1.0)
        changed_inventory = {
            **inventory,
            "products": [{
                **product,
                "observations": [
                    {**observation, "availableQty": 0 if not observation["isStockout"] else 5,
                     "isStockout": not observation["isStockout"]}
                    if observation["date"] >= "2026-01-29" else observation
                    for observation in product["observations"]
                ],
            } for product in inventory["products"]],
        }

        def recorded_inputs(snapshot):
            captured = []

            def fake_forecast(request):
                captured.append([
                    (item.productId, [value.isoformat() for value in item.dates],
                     list(item.units), list(item.stockoutFlags), item.selectedModel)
                    for item in request.series
                ])
                items = [SimpleNamespace(
                    productId=item.productId,
                    forecast=[SimpleNamespace(p50=1.0, p80=1.0, p90=1.0) for _ in range(request.horizonDays)],
                    model=item.selectedModel or "seasonal_naive_v1",
                ) for item in request.series]
                return SimpleNamespace(items=items)

            with patch("scripts.ai_forecast_walkforward_eval.run_forecast", side_effect=fake_forecast):
                evaluate(sales, snapshot, [7])
            return captured

        self.assertEqual(recorded_inputs(inventory), recorded_inputs(changed_inventory))

    def test_history_without_a_complete_fold_is_blocked(self):
        sales, inventory = snapshots(1.0)
        report = evaluate(sales, inventory, [7], minimum_train_days=29)
        self.assertEqual("BLOCKED", report["status"])
        self.assertEqual("BLOCKED", report["horizons"][0]["qualityGate"])
        self.assertEqual("BLOCKED_INSUFFICIENT_EVALUATION_DATA",
                         report["horizons"][0]["evaluationStatus"])

    def test_demand_segment_uses_only_training_prefix(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(35)]
        low = Series(productId=7, dates=dates, units=[1.0] * 28 + [100.0] * 7,
                     stockoutFlags=[False] * 35)
        high = low.model_copy(update={"units": [1.0] * 28 + [0.0] * 7})
        self.assertEqual("REGULAR", _demand_segment(low, 28))
        self.assertEqual(_demand_segment(low, 28), _demand_segment(high, 28))

    def test_short_model_output_is_not_silently_scored(self):
        sales, inventory = snapshots(1.0)
        with patch("scripts.ai_forecast_walkforward_eval.run_forecast") as mocked:
            response = mocked.return_value
            response.items = [SimpleNamespace(productId=product_id, forecast=[], model="seasonal_naive_v1")
                              for product_id in (7, 8)]
            with self.assertRaisesRegex(ValueError, "expected 7"):
                evaluate(sales, inventory, [7])

    def test_mase_uses_only_training_prefix(self):
        dates = [date(2026, 1, 1) + timedelta(days=index) for index in range(35)]
        actual = Series(productId=7, dates=dates, units=([1.0, 2.0] * 14) + [3.0] * 7,
                        stockoutFlags=[False] * 35)
        predicted = SimpleNamespace(forecast=[
            SimpleNamespace(p50=2.0, p80=2.0, p90=2.0) for _ in range(7)
        ])
        metrics = Counter()
        scored = set()
        _score_fold(metrics, scored, actual, predicted, 28, 7)
        summary = _metric_summary(metrics, scored)
        self.assertEqual(1.0, summary["mase"])

    def test_horizon_total_metric_allows_daily_error_cancellation_and_counts_zero_demand(self):
        start = date(2026, 1, 1)
        dates = [start + timedelta(days=index) for index in range(7)]
        metrics = Counter()
        scored = set()
        actual = Series(productId=7, dates=dates, units=[1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                        stockoutFlags=[False] * 7)
        predicted = SimpleNamespace(forecast=[
            SimpleNamespace(p50=value, p80=value, p90=value)
            for value in [2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        ])
        _score_fold(metrics, scored, actual, predicted, 0, 7)

        no_demand = actual.model_copy(update={"productId": 8, "units": [0.0] * 7})
        overprediction = SimpleNamespace(forecast=[
            SimpleNamespace(p50=1.0, p80=1.0, p90=1.0) for _ in range(7)
        ])
        _score_fold(metrics, scored, no_demand, overprediction, 0, 7)
        summary = _metric_summary(metrics, scored)

        self.assertEqual(2, summary["evaluatedProductWindows"])
        self.assertEqual(1, summary["zeroDemandProductWindows"])
        self.assertEqual(4.5, summary["weightedWape"])
        self.assertEqual(3.5, summary["horizonTotalWape"])
        # This synthetic fold starts at origin 0, so no training-prefix scale
        # exists; the evaluator must report MASE as unavailable.
        self.assertIsNone(summary["mase"])


if __name__ == "__main__":
    unittest.main()

