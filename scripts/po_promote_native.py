#!/usr/bin/env python3
"""Promote Shopfront shadow POs into native Orithos via purchase-orders:promote-native."""

from __future__ import annotations

import json
import os
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

# Prefer crawler proxy (internal backend:8080 behind crawler.orithos.com.au), then
# explicit POS_API_BASE_URL, then public Demo. Public CF often 502s on promote-native.
_CRAWLER = (
    os.environ.get("SHOPFRONT_CRAWLER_BASE_URL")
    or env("SHOPFRONT_CRAWLER_BASE_URL")
    or "https://crawler.orithos.com.au"
).rstrip("/")
_USE_CRAWLER = os.environ.get("PO_PROMOTE_VIA_CRAWLER", "true").lower() in {
    "1",
    "true",
    "yes",
}
BASE = (
    _CRAWLER
    if _USE_CRAWLER
    else (
        os.environ.get("POS_API_BASE_URL")
        or env("POS_API_BASE_URL")
        or "https://demo.orithos.com.au"
    )
).rstrip("/")
HEADERS = {
    "X-Shopfront-Integration-Token": TOKEN,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 OrithosPoPromoteNative/1.0",
}


def req(method: str, url: str, body: dict | None = None, timeout: int = 240) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"{exc.code} {url} {detail}") from exc


def counts(store: str) -> dict:
    return req("GET", f"{BASE}/api/integrations/shopfront/mapping-counts?storeKey={store}").get("data") or {}


def counts_public(store: str) -> dict:
    """Mapping counts always go through a public POS host (shared PG)."""
    public = (
        os.environ.get("POS_API_PUBLIC_BASE_URL")
        or "https://demo.orithos.com.au"
    ).rstrip("/")
    return req("GET", f"{public}/api/integrations/shopfront/mapping-counts?storeKey={store}").get(
        "data"
    ) or {}


def promote_store(store: str, *, limit: int, retry_skipped: bool) -> dict:
    if _USE_CRAWLER:
        body = {
            "limit": limit,
            "max_loops": int(os.environ.get("PO_PROMOTE_MAX_LOOPS", "80")),
            "retry_skipped": retry_skipped,
        }
        last_err: Exception | None = None
        for attempt in range(1, 7):
            try:
                raw = req(
                    "POST",
                    f"{BASE}/api/stores/{store}/purchase-orders/promote-native",
                    body,
                    timeout=900,
                )
                print(f"{store} crawler-promote", json.dumps(raw)[:500], flush=True)
                return raw.get("result", raw)
            except Exception as ex:  # noqa: BLE001
                last_err = ex
                print(f"{store} retry {attempt}: {ex}", flush=True)
                time.sleep(min(30, attempt * 3))
        raise RuntimeError(f"{store} promote failed: {last_err}")

    created = updated = skipped = batches = 0
    after = ""
    while True:
        body: dict = {
            "store_key": store,
            "limit": limit,
            "only_unmapped": True,
            "retry_skipped": retry_skipped,
        }
        if after:
            body["after_source_id"] = after
        ok = False
        last_err = None
        for attempt in range(1, 7):
            try:
                raw = req(
                    "POST",
                    f"{BASE}/api/integrations/shopfront/purchase-orders:promote-native",
                    body,
                )
                data = raw.get("data") or raw
                biz = data.get("business") or {}
                batch_c = int(biz.get("created") or 0)
                batch_u = int(biz.get("updated") or 0)
                batch_s = int(biz.get("skipped") or 0)
                created += batch_c
                updated += batch_u
                skipped += batch_s
                batches += 1
                mirror_batch = int(data.get("mirror_batch") or 0)
                has_more = bool(data.get("has_more"))
                after = str(data.get("last_source_id") or after)
                mapped = data.get("purchase_orders_mapped")
                print(
                    f"{store} b={batches} mirror={mirror_batch} "
                    f"c={created} u={updated} s={skipped} mapped={mapped} "
                    f"after={after[:12]}… more={has_more}",
                    flush=True,
                )
                ok = True
                if not has_more or mirror_batch == 0:
                    return {
                        "created": created,
                        "updated": updated,
                        "skipped": skipped,
                        "batches": batches,
                        "mapped": mapped,
                    }
                time.sleep(0.3)
                break
            except Exception as ex:  # noqa: BLE001
                last_err = ex
                print(f"{store} retry {attempt}: {ex}", flush=True)
                time.sleep(min(30, attempt * 3))
        if not ok:
            raise RuntimeError(f"{store} promote failed: {last_err}")


def main() -> None:
    stores = [
        s.strip()
        for s in os.environ.get("PO_PROMOTE_STORES", "demo").split(",")
        if s.strip()
    ]
    limit = int(os.environ.get("PO_PROMOTE_LIMIT", "100"))
    retry_skipped = os.environ.get("PO_PROMOTE_RETRY_SKIPPED", "false").lower() in {
        "1",
        "true",
        "yes",
    }
    print(
        f"base={BASE} via_crawler={_USE_CRAWLER} stores={stores} "
        f"limit={limit} retry_skipped={retry_skipped}",
        flush=True,
    )
    for store in ("demo", "skr"):
        print("before", store, counts_public(store), flush=True)
    results = {}
    for store in stores:
        results[store] = promote_store(store, limit=limit, retry_skipped=retry_skipped)
    for store in ("demo", "skr"):
        print("after", store, counts_public(store), flush=True)
    print("DONE", results, flush=True)


if __name__ == "__main__":
    main()
