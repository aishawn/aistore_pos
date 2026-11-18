#!/usr/bin/env python3
"""Write a small, secret-free test run manifest for CI artifacts."""

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path


STATUSES = {"PASS", "FAIL", "BLOCKED", "NOT RUN"}


def source_sha() -> str:
    value = os.environ.get("GITHUB_SHA")
    if value:
        return value
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "UNKNOWN"


def build_report(args: argparse.Namespace) -> dict:
    if args.status not in STATUSES:
        raise ValueError(f"status must be one of: {', '.join(sorted(STATUSES))}")
    return {
        "schemaVersion": 1,
        "suite": args.suite,
        "status": args.status,
        "sourceSha": source_sha(),
        "runtimeSha": args.runtime_sha or "NOT APPLICABLE",
        "environment": args.environment,
        "dataRange": args.data_range or "NOT RECORDED",
        "timezone": args.timezone,
        "modelVersion": args.model_version or "NOT APPLICABLE",
        "promptVersion": args.prompt_version or "NOT APPLICABLE",
        "durationSeconds": args.duration_seconds,
        "writeScope": args.write_scope,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", required=True)
    parser.add_argument("--status", required=True, choices=sorted(STATUSES))
    parser.add_argument("--environment", default="local")
    parser.add_argument("--data-range")
    parser.add_argument("--timezone", default="UTC")
    parser.add_argument("--model-version")
    parser.add_argument("--prompt-version")
    parser.add_argument("--duration-seconds", type=float, default=0)
    parser.add_argument("--write-scope", default="none")
    parser.add_argument("--runtime-sha")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build_report(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['suite']}: {report['status']} ({report['sourceSha']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
