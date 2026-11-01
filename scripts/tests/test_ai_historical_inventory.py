import importlib.util
import io
import unittest
import urllib.error
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/ai-eval/fetch-skr-historical-inventory.py"
SPEC = importlib.util.spec_from_file_location("skr_historical_inventory", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class HistoricalInventoryTests(unittest.TestCase):
    def test_historical_inventory_fetch_retries_transient_gateway_errors(self):
        class FlakyOpener:
            def __init__(self):
                self.calls = 0

            def open(self, request, timeout):
                self.calls += 1
                if self.calls == 1:
                    raise urllib.error.HTTPError(request.full_url, 502, "Bad Gateway", {}, io.BytesIO())
                return io.BytesIO(b'{"result":{"ok":true}}')

        client = object.__new__(MODULE.Odoo)
        client.base = "https://odoo.example"
        client.opener = FlakyOpener()

        with patch.object(MODULE.time, "sleep") as sleep:
            result = client.call("/health", {})

        self.assertEqual({"ok": True}, result)
        self.assertEqual(2, client.opener.calls)
        sleep.assert_called_once_with(1)

    def test_historical_inventory_fetch_caps_retry_backoff(self):
        class UnavailableOpener:
            def __init__(self):
                self.calls = 0

            def open(self, request, timeout):
                self.calls += 1
                raise urllib.error.HTTPError(request.full_url, 503, "Unavailable", {}, io.BytesIO())

        client = object.__new__(MODULE.Odoo)
        client.base = "https://odoo.example"
        client.opener = UnavailableOpener()

        with patch.object(MODULE.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                client.call("/health", {})

        self.assertEqual(8, client.opener.calls)
        self.assertEqual([1, 2, 4, 8, 16, 30, 30], [call.args[0] for call in sleep.call_args_list])

    def test_local_day_end_is_converted_to_utc_across_daylight_saving(self):
        self.assertEqual("2026-10-31 13:30:00", MODULE.business_day_end_utc(date(2026, 10, 31), "Australia/Adelaide"))
        self.assertEqual("2026-10-01 14:30:00", MODULE.business_day_end_utc(date(2026, 10, 1), "Australia/Adelaide"))

    def test_history_marks_research_quality_and_keeps_native_gate_separate(self):
        history = MODULE.build_history([7], [date(2026, 10, 1), date(2026, 10, 2)], {
            "2026-10-01": {7: 3.0}, "2026-10-02": {7: 0.0},
        }, company_id=5, timezone_name="Australia/Adelaide")
        self.assertEqual("READY_FOR_RESEARCH_BACKTEST", history["backtestReadiness"])
        self.assertEqual("INSUFFICIENT_NATIVE_DAILY_SNAPSHOTS", history["nativeSnapshotAcceptanceReadiness"])
        self.assertEqual([False, True], [item["isStockout"] for item in history["products"][0]["observations"]])
        self.assertEqual([], history["writeRequests"])

    def test_missing_rows_are_unknown_and_block_research_readiness(self):
        history = MODULE.build_history([7], [date(2026, 10, 1), date(2026, 10, 2)], {
            "2026-10-01": {7: 3.0}, "2026-10-02": {},
        }, company_id=5, timezone_name="Australia/Adelaide")
        self.assertEqual("INCOMPLETE_HISTORICAL_QUERY", history["backtestReadiness"])
        self.assertIsNone(history["products"][0]["observations"][1]["isStockout"])
        self.assertEqual(1, history["missingObservationCount"])

    def test_product_ids_are_deduplicated_and_can_be_sample_limited(self):
        snapshot = {"series": [{"productId": 9}, {"productId": 3}, {"productId": 9}, {"productId": None}]}
        self.assertEqual([3, 9], MODULE.product_ids_from_snapshot(snapshot))
        self.assertEqual([3], MODULE.product_ids_from_snapshot(snapshot, 1))

    def test_repeated_sales_with_nonpositive_stock_blocks_inventory_backtest(self):
        dates = [date(2026, 8, 1) + timedelta(days=index) for index in range(28)]
        history = MODULE.build_history(
            [7], dates, {day.isoformat(): {7: 0.0} for day in dates},
            company_id=5, timezone_name="Australia/Adelaide",
        )
        sales = {"series": [{
            "productId": 7,
            "dates": [day.isoformat() for day in dates],
            "units": [1.0 if index < 14 else 0.0 for index in range(28)],
        }]}

        validated = MODULE.validate_sales_inventory_consistency(sales, history)

        self.assertEqual("SUSPECT", validated["inventoryConsistencyStatus"])
        self.assertEqual("BLOCKED_DATA_QUALITY", validated["backtestReadiness"])
        self.assertEqual("PERSISTENT_NONPOSITIVE_STOCK_WITH_REPEATED_SALES",
                         validated["qualityWarnings"][0]["code"])


if __name__ == "__main__":
    unittest.main()
