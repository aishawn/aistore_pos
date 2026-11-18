#!/usr/bin/env python3
"""Fail when a JUnit XML report contains failed or errored test cases."""
import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def failure_counts(path: Path) -> tuple[int, int, int]:
    root = ET.parse(path).getroot()
    cases = list(root.iter("testcase"))
    if cases:
        failures = sum(len(case.findall("failure")) for case in cases)
        errors = sum(len(case.findall("error")) for case in cases)
        return len(cases), failures, errors
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    tests = failures = errors = 0
    for suite in suites:
        tests += int(suite.attrib.get("tests", "0"))
        failures += int(suite.attrib.get("failures", "0"))
        errors += int(suite.attrib.get("errors", "0"))
    return tests, failures, errors


def combined_failure_counts(paths: list[Path]) -> tuple[int, int, int]:
    totals = [0, 0, 0]
    for path in paths:
        counts = failure_counts(path)
        totals = [total + count for total, count in zip(totals, counts)]
    return tuple(totals)


def report_exit_code(paths: Path | list[Path]) -> int:
    if isinstance(paths, Path):
        paths = [paths]
    _, failures, errors = combined_failure_counts(paths)
    return 1 if failures or errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, nargs="+")
    args = parser.parse_args()
    try:
        tests, failures, errors = combined_failure_counts(args.report)
    except (ET.ParseError, OSError, ValueError) as error:
        print(f"invalid JUnit report: {error}", file=sys.stderr)
        return 2
    print(f"JUnit: {tests} tests, {failures} failures, {errors} errors")
    return report_exit_code(args.report)


if __name__ == "__main__":
    raise SystemExit(main())
