#!/usr/bin/env python3
"""Run Schemathesis against an explicitly allowlisted read-only test host."""
import os
import subprocess
import sys
from urllib.parse import urlparse


def main() -> int:
    schema = os.environ.get("API_SCHEMA", "http://127.0.0.1:8080/v3/api-docs")
    base_url = os.environ.get("API_BASE_URL", "http://127.0.0.1:8080")
    allowed_hosts = {
        host.strip().lower()
        for host in os.environ.get("SCHEMATHESIS_ALLOWED_HOSTS", "127.0.0.1,localhost,::1").split(",")
        if host.strip()
    }
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        print("API_BASE_URL must be an HTTP(S) URL", file=sys.stderr)
        return 2
    if parsed.hostname.lower() not in allowed_hosts:
        print("API_BASE_URL host is not in SCHEMATHESIS_ALLOWED_HOSTS", file=sys.stderr)
        return 2
    command = [
        "st",
        "run",
        schema,
        "--url",
        base_url,
        "--include-method",
        "GET",
    ]
    return subprocess.call(command)


if __name__ == "__main__":
    raise SystemExit(main())
