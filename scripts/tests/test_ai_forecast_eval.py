import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "forecast-service"))
from app.schemas import Series
from scripts.ai_forecast_eval import MODEL_NAMES, _business_metrics, _group_labels, rolling_metrics, select_model

import importlib.util
MOVE_MODULE_PATH = ROOT / "scripts/ai-eval/fetch-skr-sales-snapshot.py"
move_module_spec = importlib.util.spec_from_file_location("skr_snapshot", MOVE_MODULE_PATH)
move_module = importlib.util.module_from_spec(move_module_spec)
move_module_spec.loader.exec_module(move_module)
move_delta = move_module.move_delta


class ForecastEvaluationTests(unittest.TestCase):
    def test_rolling_metrics_excludes_censored_holdout_days(self):
        payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
        series = Series(**payload["series"][1])

        result = rolling_metrics(series, 7)

        self.assertEqual("PASS", result["status"])
        self.assertEqual(2, result["windowCount"])
        self.assertEqual(1, result["censoredWindowCount"])
        self.assertLess(result["meanWape"], 0.20)
        self.assertLess(result["weightedWape"], 0.20)

    def test_rolling_metrics_blocks_fully_censored_windows_without_crashing(self):
        start = date(2026, 1, 1)
        series = Series(productId=2,
                        dates=[start + timedelta(days=index) for index in range(21)],
                        units=[4.0] * 21, stockoutFlags=[False] * 14 + [True] * 7)

        result = rolling_metrics(series, 7)

        self.assertEqual("BLOCKED", result["status"])
        self.assertEqual(1, result["blockedWindowCount"])
        self.assertIsNone(result["meanMae"])
        self.assertIsNone(result["p80Coverage"])

    def test_cli_accepts_relative_snapshot_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            report = Path(temp_dir) / "report.json"
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/ai_forecast_eval.py"),
                 "forecast-service/fixtures/skr-snapshot-demo.json", str(report)],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            report_exists = report.exists()

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertTrue(report_exists)

    def test_all_baselines_return_metrics(self):
        payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
        series = Series(**payload["series"][0])
        for model in MODEL_NAMES:
            result = rolling_metrics(series, 7, model)
            self.assertEqual("PASS", result["status"], model)
            self.assertIsNotNone(result["meanWape"], model)

    def test_missing_inventory_history_is_not_reported_as_no_stockout(self):
        series = Series(productId=9, category="WINE", dates=[], units=[],
                        stockoutDataQuality="UNAVAILABLE_HISTORICAL_INVENTORY")
        self.assertEqual("UNKNOWN", _group_labels(series)["stockoutRatio"])

        inferred = Series(productId=10, dates=[date(2026, 1, 1)], units=[1],
                          stockoutFlags=[True], stockoutDataQuality="INFERRED_FROM_STOCK_MOVES")
        self.assertEqual("HIGH_GT_10", _group_labels(inferred)["stockoutRatio"])

    def test_stock_move_direction_is_signed_by_location_usage(self):
        self.assertEqual(-3.0, move_delta("internal", "customer", 3))
        self.assertEqual(4.0, move_delta("supplier", "internal", 4))
        self.assertEqual(0.0, move_delta("internal", "internal", 99))

    def test_model_comparison_covers_all_horizons_and_group_dimensions(self):
        report_path = ROOT / "reports" / "test-ai-forecast-eval.json"
        result = subprocess.run([sys.executable, str(ROOT / "scripts/ai_forecast_eval.py"),
                                 str(ROOT / "forecast-service/fixtures/skr-snapshot-demo.json"),
                                 str(report_path)], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)
        report = json.loads(report_path.read_text())
        self.assertEqual(36, len(report["modelComparison"]))
        self.assertEqual({7, 14, 28}, {row["horizonDays"] for row in report["modelComparison"]})
        self.assertEqual({"category", "stockoutRatio", "volume"},
                         {row["groupBy"] for row in report["modelComparison"]})
        report_path.unlink(missing_ok=True)

    def test_model_selection_is_per_product_and_blocks_fully_censored_series(self):
        payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
        selected = select_model(Series(**payload["series"][0]), 7)
        self.assertEqual("PASS", selected["selectionStatus"])
        self.assertIn(selected["selectedModel"], MODEL_NAMES)
        self.assertEqual("weightedWape_then_absolute_bias", selected["selectionMetric"])

        start = date(2026, 1, 1)
        blocked = Series(productId=99, dates=[start + timedelta(days=index) for index in range(21)],
                         units=[2.0] * 21, stockoutFlags=[True] * 21)
        result = select_model(blocked, 7)
        self.assertEqual("BLOCKED", result["selectionStatus"])
        self.assertIsNone(result["selectedModel"])

    def test_business_metrics_expose_unit_proxies_without_inventing_costs(self):
        metrics = _business_metrics([{
            "underForecastUnits": 3.0, "overForecastUnits": 5.0,
            "evaluationCensoredDays": 2, "evaluatedWindowCount": 8,
        }])
        self.assertEqual("COST_CONFIG_REQUIRED", metrics["status"])
        self.assertEqual(3.0, metrics["stockoutUnitProxy"])
        self.assertIsNone(metrics["stockoutLoss"])

        configured = _business_metrics([{
            "underForecastUnits": 3.0, "overForecastUnits": 5.0,
            "evaluationCensoredDays": 2, "evaluatedWindowCount": 8,
        }], {"stockoutCostPerUnit": 10, "holdingCostPerUnitDay": 0.5,
              "expiryRiskPerUnit": 2})
        self.assertEqual("CONFIGURED", configured["status"])
        self.assertEqual(30.0, configured["stockoutLoss"])
        self.assertEqual(2.5, configured["holdingCost"])


if __name__ == "__main__":
    unittest.main()
