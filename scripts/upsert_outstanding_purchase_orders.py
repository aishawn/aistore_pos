#!/usr/bin/env python3
"""Upsert crawler SENT/OPEN purchase orders into Orithos via purchase-orders:upsert.

Reads normalized Shopfront GraphQL payloads from the crawler Postgres on the
Dokploy host (or a local TSV export) and posts them without raw_payload.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def env(name: str) -> str | None:
    prefix = f"{name}="
    for path in (ROOT / ".env", ROOT / "pos-api" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith(prefix):
                return line[len(prefix) :].strip().strip('"').strip("'")
    return os.environ.get(name)


TOKEN = env("SHOPFRONT_POS_API_TOKEN") or env("SHOPFRONT_INTEGRATION_TOKEN")
if not TOKEN:
    raise SystemExit("SHOPFRONT_POS_API_TOKEN missing")

POS_BASE = (os.environ.get("PO_UPSERT_POS_BASE") or "https://skr.orithos.com.au").rstrip("/")
STORE = (os.environ.get("PO_UPSERT_STORE") or "skr").strip().lower()
STATUSES = [s.strip().upper() for s in (os.environ.get("PO_UPSERT_STATUSES") or "SENT,OPEN").split(",") if s.strip()]


def req(method: str, url: str, body: dict | None = None, timeout: int = 180) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "X-Shopfront-Integration-Token": TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 OrithosOutstandingPoUpsert/1.0",
    }
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"{exc.code} {url} {detail}") from exc


def load_items_from_tsv(path: Path) -> list[dict]:
    items: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 5)
        if len(parts) < 6:
            continue
        source_id, supplier_source_id, status, order_date, total_cost, raw = parts
        payload = json.loads(raw)
        payload["source_id"] = source_id
        payload["id"] = source_id
        if supplier_source_id:
            payload["supplier_source_id"] = supplier_source_id
        payload["status"] = status or payload.get("status")
        if order_date and not payload.get("orderDate"):
            payload["orderDate"] = order_date
        if total_cost and payload.get("totalCost") is None:
            payload["totalCost"] = total_cost
        payload.pop("raw_payload", None)
        payload.pop("rawPayload", None)
        items.append(payload)
    return items


def main() -> int:
    tsv = Path(os.environ.get("PO_UPSERT_TSV") or ROOT / ".local-wip-parked" / "skr_sent_raw.tsv")
    if not tsv.exists():
        print(f"missing export {tsv}", file=sys.stderr)
        return 1
    items = [item for item in load_items_from_tsv(tsv) if str(item.get("status") or "").upper() in STATUSES]
    print(f"store={STORE} items={len(items)} statuses={STATUSES} base={POS_BASE}", flush=True)
    if not items:
        print("nothing to upsert", flush=True)
        return 0
    response = req(
        "POST",
        f"{POS_BASE}/api/integrations/shopfront/purchase-orders:upsert",
        {"store_key": STORE, "items": items},
    )
    data = response.get("data") or {}
    business = data.get("native_ledger") or data.get("business") or {}
    print(json.dumps({"status": data.get("status"), "business": business}, default=str), flush=True)
    errors = business.get("errors") or []
    if errors:
        print("errors", errors[:5], flush=True)
    return 0 if int(business.get("created") or 0) + int(business.get("updated") or 0) > 0 or not errors else 2


if __name__ == "__main__":
    raise SystemExit(main())
