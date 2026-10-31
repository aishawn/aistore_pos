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
from scripts.ai_forecast_eval import (MODEL_NAMES, _business_metrics, _demand_profile, _group_labels,
                                      apply_inventory_history, apply_native_inventory_history, cold_start_similarity,
                                      rolling_metrics, select_model)

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

    def test_cli_accepts_native_inventory_history_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
            history = {"dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS", "backtestReadiness": "READY_FOR_NATIVE_STOCKOUT_BACKTEST",
                       "products": [{"productId": item["productId"], "observations": [
                           {"date": day, "isStockout": False} for day in item["dates"]
                       ]} for item in payload["series"]]}
            history_path = temp / "inventory-history.json"
            report = temp / "report.json"
            history_path.write_text(json.dumps(history), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/ai_forecast_eval.py"),
                 "forecast-service/fixtures/skr-snapshot-demo.json", str(report), str(history_path)],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual("APPLIED", json.loads(report.read_text())["inventoryHistory"]["status"])

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

    def test_native_inventory_history_replaces_inferred_flags_only_when_complete(self):
        series = Series(productId=9, dates=[date(2026, 1, 1), date(2026, 1, 2)],
                        units=[2, 0], stockoutFlags=[False, False],
                        stockoutDataQuality="INFERRED_FROM_STOCK_MOVES")
        history = {"dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS", "products": [{
            "productId": 9,
            "observations": [
                {"date": "2026-01-01", "isStockout": False},
                {"date": "2026-01-02", "isStockout": True},
            ],
        }]}
        applied = apply_native_inventory_history(series, history)
        self.assertEqual([False, True], applied.stockoutFlags)
        self.assertEqual("NATIVE_ODOO_DAILY_SNAPSHOTS", applied.stockoutDataQuality)
        partial = apply_native_inventory_history(series, {"products": [{
            "productId": 9, "observations": [{"date": "2026-01-01", "isStockout": False}]
        }]})
        self.assertEqual("HISTORICAL_INVENTORY_INCOMPLETE", partial.stockoutDataQuality)
        self.assertEqual([False, False], partial.stockoutFlags)

    def test_historical_odoo_to_date_inventory_is_applied_with_research_provenance(self):
        series = Series(productId=21, dates=[date(2026, 10, 1), date(2026, 10, 2)],
                        units=[2, 0], stockoutFlags=[False, False],
                        stockoutDataQuality="INFERRED_FROM_STOCK_MOVES")
        history = {"dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
                   "backtestReadiness": "READY_FOR_RESEARCH_BACKTEST",
                   "nativeSnapshotAcceptanceReadiness": "INSUFFICIENT_NATIVE_DAILY_SNAPSHOTS",
                   "products": [{"productId": 21, "observations": [
                       {"date": "2026-10-01", "availableQty": 4, "isStockout": False},
                       {"date": "2026-10-02", "availableQty": 0, "isStockout": True},
                   ]}]}

        applied = apply_inventory_history(series, history)

        self.assertEqual([False, True], applied.stockoutFlags)
        self.assertEqual("RECONSTRUCTED_FROM_ODOO_TO_DATE", applied.stockoutDataQuality)
        self.assertEqual("HIGH_GT_10", _group_labels(applied)["stockoutRatio"])
        self.assertEqual([False, True], apply_native_inventory_history(series, history).stockoutFlags)

    def test_suspect_historical_inventory_does_not_replace_existing_stockout_flags(self):
        series = Series(productId=21, dates=[date(2026, 10, 1), date(2026, 10, 2)],
                        units=[2, 0], stockoutFlags=[False, True],
                        stockoutDataQuality="INFERRED_FROM_STOCK_MOVES")
        history = {"dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
                   "backtestReadiness": "BLOCKED_DATA_QUALITY",
                   "qualityWarnings": [{"code": "PERSISTENT_NONPOSITIVE_STOCK_WITH_REPEATED_SALES"}],
                   "products": [{"productId": 21, "observations": [
                       {"date": "2026-10-01", "isStockout": True},
                       {"date": "2026-10-02", "isStockout": True},
                   ]}]}

        result = apply_inventory_history(series, history)

        self.assertEqual([False, True], result.stockoutFlags)
        self.assertEqual("INFERRED_FROM_STOCK_MOVES", result.stockoutDataQuality)

    def test_product_scoped_inventory_warning_does_not_block_other_products(self):
        series = Series(productId=22, dates=[date(2026, 10, 1), date(2026, 10, 2)],
                        units=[1, 0], stockoutFlags=[False, False])
        history = {"dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
                   "qualityWarnings": [{"productId": 21, "code": "STOCK_SALES_CONFLICT"}],
                   "products": [{"productId": 22, "observations": [
                       {"date": "2026-10-01", "isStockout": False},
                       {"date": "2026-10-02", "isStockout": True},
                   ]}]}

        result = apply_inventory_history(series, history)

        self.assertEqual([False, True], result.stockoutFlags)
        self.assertEqual("RECONSTRUCTED_FROM_ODOO_TO_DATE", result.stockoutDataQuality)

    def test_cli_marks_suspect_inventory_history_blocked(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
            history = {"dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
                       "backtestReadiness": "BLOCKED_DATA_QUALITY",
                       "qualityWarnings": [{"code": "PERSISTENT_NONPOSITIVE_STOCK_WITH_REPEATED_SALES"}],
                       "products": []}
            history_path = temp / "inventory-history.json"
            report_path = temp / "report.json"
            history_path.write_text(json.dumps(history), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/ai_forecast_eval.py"),
                 str(ROOT / "forecast-service/fixtures/skr-snapshot-demo.json"),
                 str(report_path), str(history_path)],
                cwd=ROOT, capture_output=True, text=True, check=False,
            )
            report = json.loads(report_path.read_text())

        self.assertEqual(2, result.returncode)
        self.assertEqual("BLOCKED", report["status"])
        self.assertEqual("BLOCKED", report["qualityGate"])
        self.assertEqual("REJECTED_QUALITY_GATE", report["inventoryHistory"]["status"])

    def test_historical_inventory_partial_coverage_does_not_turn_missing_into_stockout(self):
        series = Series(productId=22, dates=[date(2026, 10, 1), date(2026, 10, 2)],
                        units=[1, 0], stockoutFlags=[False, False])
        applied = apply_inventory_history(series, {"dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
            "products": [{"productId": 22, "observations": [
                {"date": "2026-10-01", "isStockout": False}
            ]}]})

        self.assertEqual([False, False], applied.stockoutFlags)
        self.assertEqual("HISTORICAL_INVENTORY_INCOMPLETE", applied.stockoutDataQuality)

    def test_stock_move_direction_is_signed_by_location_usage(self):
        self.assertEqual(-3.0, move_delta("internal", "customer", 3))
        self.assertEqual(4.0, move_delta("supplier", "internal", 4))
        self.assertEqual(0.0, move_delta("internal", "internal", 99))

    def test_stock_move_reader_pages_large_history_without_dropping_rows(self):
        class FakeOdoo:
            def __init__(self):
                self.calls = []
                self.rows = [{"id": value} for value in range(5)]

            def read(self, model, domain, fields, limit, offset):
                self.calls.append((model, limit, offset))
                return self.rows[offset:offset + limit]

        client = FakeOdoo()
        rows = move_module.read_all(client, "stock.move", [], ["id"], page_size=2)

        self.assertEqual([{"id": value} for value in range(5)], rows)
        self.assertEqual([("stock.move", 2, 0), ("stock.move", 2, 2), ("stock.move", 2, 4)], client.calls)

    def test_model_comparison_covers_all_horizons_and_group_dimensions(self):
        report_path = ROOT / "reports" / "test-ai-forecast-eval.json"
        result = subprocess.run([sys.executable, str(ROOT / "scripts/ai_forecast_eval.py"),
                                 str(ROOT / "forecast-service/fixtures/skr-snapshot-demo.json"),
                                 str(report_path)], cwd=ROOT, capture_output=True, text=True, check=False)
        self.assertEqual(0, result.returncode, result.stderr)
        report = json.loads(report_path.read_text())
        self.assertEqual(54, len(report["modelComparison"]))
        self.assertEqual({7, 14, 28}, {row["horizonDays"] for row in report["modelComparison"]})
        self.assertEqual({"category", "stockoutRatio", "volume"},
                         {row["groupBy"] for row in report["modelComparison"]})
        report_path.unlink(missing_ok=True)

    def test_tsb_is_available_for_intermittent_demand(self):
        payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
        series = Series(**payload["series"][0])
        result = rolling_metrics(series, 7, "tsb_v1")
        self.assertEqual("PASS", result["status"])

    def test_two_stage_model_handles_sparse_sales(self):
        start = date(2026, 1, 1)
        series = Series(productId=101,
                        dates=[start + timedelta(days=index) for index in range(28)],
                        units=[0, 0, 0, 4] * 7)
        result = rolling_metrics(series, 7, "two_stage_occurrence_v1")
        self.assertEqual("PASS", result["status"])
        self.assertGreaterEqual(result["meanMae"], 0)

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
        self.assertIsNone(configured["serviceLevel"])
        self.assertIsNone(configured["expectedStockoutDaysAfterReplenishment"])
        self.assertEqual("REQUIRES_NATIVE_INVENTORY_HISTORY", configured["stockoutDaysDataQuality"])

    def test_cost_configured_selection_uses_business_cost(self):
        payload = json.loads((ROOT / "forecast-service/fixtures/skr-snapshot-demo.json").read_text())
        selected = select_model(Series(**payload["series"][0]), 7,
                                {"stockoutCostPerUnit": 50, "holdingCostPerUnitDay": 0.5,
                                 "expiryRiskPerUnit": 1})
        self.assertEqual("PASS", selected["selectionStatus"])
        self.assertEqual("business_cost_then_absolute_bias", selected["selectionMetric"])
        self.assertIsNotNone(selected["selectedMetrics"]["businessCost"])

    def test_cold_start_uses_matching_mature_products_and_marks_inferred_quality(self):
        start = date(2026, 1, 1)
        peer = Series(productId=201, category="Wine", brand="Example", priceBand="MID",
                      dates=[start + timedelta(days=index) for index in range(21)], units=[2.0] * 21)
        new = Series(productId=202, category="Wine", brand="Example", priceBand="MID",
                     isNew=True, dates=[start + timedelta(days=index) for index in range(3)], units=[0.0, 1.0, 0.0])
        result = cold_start_similarity(new, [new, peer], 7)
        self.assertEqual("PASS", result["status"])
        self.assertEqual("INFERRED_FROM_SIMILAR_PRODUCTS", result["dataQuality"])
        self.assertEqual([2.0] * 7, result["forecast"])
        self.assertEqual(201, result["matches"][0]["productId"])

    def test_demand_profile_distinguishes_weekly_pattern_from_constant_sales(self):
        start = date(2026, 1, 1)
        weekly = [2, 2, 2, 2, 2, 8, 10] * 4
        weekly_series = Series(productId=301,
                               dates=[start + timedelta(days=index) for index in range(len(weekly))],
                               units=weekly)
        constant = Series(productId=302,
                          dates=[start + timedelta(days=index) for index in range(28)],
                          units=[4.0] * 28)
        self.assertEqual("WEEKLY_PATTERN_CANDIDATE", _demand_profile(weekly_series))
        self.assertEqual("GENERAL", _demand_profile(constant))


if __name__ == "__main__":
    unittest.main()
