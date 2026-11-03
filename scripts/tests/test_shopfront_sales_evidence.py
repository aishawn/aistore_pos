"""Integrity and financial-boundary checks for the offline source verifier."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "source_verifier", Path(__file__).parents[1] / "verify-shopfront-sales-evidence.py")
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class SourceEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        # Signed refund costs are original line totals; intentionally preserve a
        # one-cent order/line cost difference rather than silently repairing it.
        self.sale = {"id": "s1", "status": "COMPLETED", "createdAt": "2026-10-20T12:00:00+1030",
                     "totalPrice": "9", "totalTax": "0.82", "totalCost": "4.01",
                     "items": [{"id": "l1", "quantity": 2, "totalPrice": 12, "tax": "1.09",
                                "cost": 5, "item": {"id": "p1"}},
                               {"id": "l2", "quantity": -1, "totalPrice": -3, "tax": "-0.27",
                                "cost": -1, "item": {"id": "p2"}}]}
        self.result = {"complete": True, "endCursorReached": True, "invalidOrders": 0,
                       "pages": 1, "orders": 1, "completedOrders": 1, "completedLines": 2,
                       "refundLines": 1, "sourceOrderLineDifferences": 1, "statusCounts": {"COMPLETED": 1},
                       "totals": {"totalPrice": "9", "totalTax": "0.82", "totalCost": "4.01"},
                       "netSales": "8.18", "grossProfit": "4.17",
                       "scope": {"store": "skr", "timezone": "Australia/Adelaide",
                                 "fromDay": "2026-10-20", "toDayExclusive": "2026-10-21",
                                 "fromUtc": "2026-10-19T13:30:00Z", "toUtcExclusive": "2026-10-20T13:30:00Z"}}
        self.save()

    def save(self):
        page = json.dumps({"edges": [{"node": self.sale}], "pageInfo": {"hasNextPage": False}}).encode()
        (self.folder / "000001.json").write_bytes(page)
        manifest = json.dumps([{"file": "000001.json", "rows": 1, "sha256": VERIFIER.digest(page)}]).encode()
        (self.folder / "pages-manifest.json").write_bytes(manifest)
        self.result["manifestSha256"] = VERIFIER.digest(manifest)
        (self.folder / "result.json").write_text(json.dumps(self.result))

    def test_preserves_signed_line_costs_and_order_rounding(self):
        report = VERIFIER.verify(self.folder)
        self.assertEqual(report["grossProfit"], "4.17")
        self.assertEqual(report["refundLines"], 1)
        self.assertEqual(report["sourceOrderLineDifferences"], 1)
        expected = [["s1", "COMPLETED", "2026-10-20T01:30:00.000Z", "9.000000", "0.820000", "4.010000",
                     [["l1", "p1", "2.000000", "12.000000", "1.090000", "5.000000"],
                      ["l2", "p2", "-1.000000", "-3.000000", "-0.270000", "-1.000000"]]]]
        self.assertEqual(report["financialProjectionSha256"], VERIFIER.fingerprint(expected))
        # Independently generated with Node JSON.stringify/Number.toFixed and
        # Date.toISOString, matching the existing mirror fingerprint producer.
        self.assertEqual(report["financialProjectionSha256"],
                         "28d41b0b993e414c30b18fbaf72d931130aa876399d1566109497597bbb2aeb3")
        self.assertFalse(report["accountingVerified"])

    def test_rejects_page_tampering_and_extra_pages(self):
        (self.folder / "000001.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "page hash"):
            VERIFIER.verify(self.folder)
        self.save()
        (self.folder / "000002.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "differ from manifest"):
            VERIFIER.verify(self.folder)

    def test_rejects_incomplete_terminal_capture(self):
        self.result["complete"] = False
        self.save()
        with self.assertRaisesRegex(ValueError, "Completed terminal"):
            VERIFIER.verify(self.folder)

    def test_rejects_duplicate_line_even_with_valid_file_hashes(self):
        self.sale["items"][1]["id"] = "l1"
        self.save()
        with self.assertRaisesRegex(ValueError, "source line ID"):
            VERIFIER.verify(self.folder)

    def test_rejects_missing_cost_and_out_of_period_order(self):
        self.sale["items"][0]["cost"] = None
        self.save()
        with self.assertRaisesRegex(ValueError, "Missing source amount"):
            VERIFIER.verify(self.folder)
        self.sale["items"][0]["cost"] = 5
        self.sale["createdAt"] = self.result["scope"]["toUtcExclusive"]
        self.save()
        with self.assertRaisesRegex(ValueError, "outside exact period"):
            VERIFIER.verify(self.folder)

    def test_mirror_difference_is_reported_without_changing_source(self):
        report = VERIFIER.verify(self.folder)
        mirror = dict(report, scope={"store": "skr", "timezone": "Australia/Adelaide",
                                     "from": "2026-10-20", "to": "2026-10-21"})
        path = self.folder / "mirror.json"
        path.write_text(json.dumps(mirror))
        self.assertTrue(VERIFIER.verify(self.folder, path)["mirrorProjectionMatches"])
        mirror["financialProjectionSha256"] = "0" * 64
        path.write_text(json.dumps(mirror))
        checked = VERIFIER.verify(self.folder, path)
        self.assertFalse(checked["mirrorProjectionMatches"])
        self.assertTrue(checked["mirrorChecks"]["completedIdsSha256"])
        mirror["scope"]["from"] = "2026-10-19"
        path.write_text(json.dumps(mirror))
        with self.assertRaisesRegex(ValueError, "Mirror scope mismatch"):
            VERIFIER.verify(self.folder, path)


if __name__ == "__main__":
    unittest.main()
