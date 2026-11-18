import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("check_junit.py")
SPEC = importlib.util.spec_from_file_location("check_junit_report", MODULE_PATH)
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


class JUnitReportTests(unittest.TestCase):
    def test_counts_test_cases_when_reporter_omits_suite_attributes(self):
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "report.xml"
            report.write_text(
                '<testsuites><testcase/><testcase><failure/></testcase></testsuites>',
                encoding="utf-8",
            )
            self.assertEqual(checker.failure_counts(report), (2, 1, 0))

    def test_counts_nested_suites_once(self):
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "report.xml"
            report.write_text(
                '<testsuites tests="2" failures="1"><testsuite tests="2" failures="1">'
                '<testcase/><testcase><failure/></testcase></testsuite></testsuites>',
                encoding="utf-8",
            )
            self.assertEqual(checker.failure_counts(report), (2, 1, 0))

    def test_reports_with_failures_return_nonzero(self):
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "report.xml"
            report.write_text('<testsuite tests="1" errors="1"/>', encoding="utf-8")
            self.assertEqual(checker.report_exit_code(report), 1)

    def test_combines_multiple_reports(self):
        with tempfile.TemporaryDirectory() as temp:
            passed = Path(temp) / "passed.xml"
            failed = Path(temp) / "failed.xml"
            passed.write_text('<testsuite tests="2"/>', encoding="utf-8")
            failed.write_text('<testsuite tests="1" failures="1"/>', encoding="utf-8")
            self.assertEqual(checker.combined_failure_counts([passed, failed]), (3, 1, 0))
            self.assertEqual(checker.report_exit_code([passed, failed]), 1)


if __name__ == "__main__":
    unittest.main()
