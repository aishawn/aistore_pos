#!/usr/bin/env python3
"""Catch SKR native purchase orders up from Shopfront shadow rows on pos-api."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def env(name: str) -> str | None:
    prefix = f"{name}="
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(prefix):
            return line[len(prefix) :].strip().strip('"').strip("'")
    return None


TOKEN = env("SHOPFRONT_POS_API_TOKEN") or env("SHOPFRONT_INTEGRATION_TOKEN")
if not TOKEN:
    raise SystemExit("SHOPFRONT_POS_API_TOKEN missing")

HEADERS = {
    "X-Shopfront-Integration-Token": TOKEN,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 OrithosSkrPoCatchup/1.0",
}


def req(method: str, url: str, body: dict | None = None, timeout: int = 180) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"{exc.code} {url} {detail}") from exc


def main() -> None:
    for store in ("demo", "skr"):
        counts = req(
            "GET",
            f"https://demo.orithos.com.au/api/integrations/shopfront/mapping-counts?storeKey={store}",
        )
        print("before", store, counts.get("data"), flush=True)

    created = updated = skipped = fails = 0
    page = 1
    while page <= 200:
        ok = False
        for attempt in range(1, 5):
            try:
                sample = req(
                    "GET",
                    "https://demo.orithos.com.au/api/integrations/shopfront/data"
                    f"?storeKey=skr&type=purchase_orders&page={page}&size=3",
                )
                rows = ((sample.get("data") or {}).get("data")) or []
                if not rows:
                    print(f"empty page {page}", flush=True)
                    page = 9999
                    ok = True
                    break
                items = []
                for row in rows:
                    raw = row.get("raw_payload")
                    if isinstance(raw, str):
                        raw = json.loads(raw)
                    supplier = row.get("supplier_source_id")
                    items.append(
                        {
                            "source_id": str(row.get("source_id") or ""),
                            "supplier_source_id": str(supplier) if supplier else None,
                            "status": row.get("status"),
                            "order_date": row.get("order_date"),
                            "total_cost": row.get("total_cost"),
                            "raw_payload": raw,
                        }
                    )
                up = req(
                    "POST",
                    "https://demo.orithos.com.au/api/integrations/shopfront/purchase-orders:upsert",
                    {"store_key": "skr", "items": items},
                )
                native = (
                    (up.get("data") or {}).get("native_ledger")
                    or (up.get("data") or {}).get("business")
                    or {}
                )
                batch_c = int(native.get("created") or 0)
                batch_u = int(native.get("updated") or 0)
                batch_s = int(native.get("skipped") or 0)
                created += batch_c
                updated += batch_u
                skipped += batch_s
                errs = native.get("errors") or []
                msg = f"p={page} c={created} u={updated} s={skipped} +c={batch_c} +u={batch_u} +s={batch_s}"
                if errs:
                    msg += f" e={str(errs[0])[:120]}"
                print(msg, flush=True)
                if len(rows) < 3:
                    print("last page", flush=True)
                    page = 9999
                ok = True
                time.sleep(1.5)
                break
            except Exception as ex:  # noqa: BLE001
                if attempt >= 6:
                    fails += 1
                    print(f"p={page} FAIL {ex}", flush=True)
                    time.sleep(8)
                else:
                    print(f"p={page} retry {attempt}: {ex}", flush=True)
                    time.sleep(attempt * 3)
        page += 1

    after = req(
        "GET",
        "https://demo.orithos.com.au/api/integrations/shopfront/mapping-counts?storeKey=skr",
    )
    print(
        "DONE",
        {"created": created, "updated": updated, "skipped": skipped, "fails": fails, "after": after.get("data")},
        flush=True,
    )


if __name__ == "__main__":
    main()
