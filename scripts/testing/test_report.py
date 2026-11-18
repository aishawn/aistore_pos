import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("report.py")
SPEC = importlib.util.spec_from_file_location("test_report_manifest", MODULE_PATH)
report_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(report_module)


class ReportManifestTests(unittest.TestCase):
    def test_report_contains_traceability_and_no_raw_output_field(self):
        args = type("Args", (), {
            "suite": "offline-ai-fixtures", "status": "PASS", "runtime_sha": None,
            "environment": "github-actions", "data_range": None, "timezone": "UTC",
            "model_version": None, "prompt_version": None, "duration_seconds": 3.5,
            "write_scope": "none",
        })()
        report = report_module.build_report(args)
        self.assertEqual(report["suite"], "offline-ai-fixtures")
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["writeScope"], "none")
        self.assertNotIn("output", report)
        self.assertNotIn("credentials", report)

    def test_unknown_status_is_rejected(self):
        args = type("Args", (), {
            "suite": "x", "status": "PARTIAL", "runtime_sha": None,
            "environment": "local", "data_range": None, "timezone": "UTC",
            "model_version": None, "prompt_version": None, "duration_seconds": 0,
            "write_scope": "none",
        })()
        with self.assertRaisesRegex(ValueError, "status must be"):
            report_module.build_report(args)


if __name__ == "__main__":
    unittest.main()
