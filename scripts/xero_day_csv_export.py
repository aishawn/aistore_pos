#!/usr/bin/env python3
"""Export one Orithos business-day sales pack for owner Xero acceptance.

Uses cookie-session login against a store host (no secrets printed). Produces:
  - day_summary.csv  — sale/refund counts and GST-inclusive totals
  - day_lines.csv    — per-sale invoice rows for import/review

This is the interim executable acceptance path until a first-class
/api/accounting/xero route exists. Payment-method split is omitted when
the live /api/sales payload does not expose payments.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx


def _money(value: Any) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise SystemExit(f"Missing required env var {name}")
    return value


def login(client: httpx.Client, host: str, username: str, password: str) -> None:
    response = client.post(
        f"{host.rstrip('/')}/api/auth/login",
        json={"username": username, "password": password},
        timeout=30.0,
    )
    response.raise_for_status()
    body = response.json()
    if body.get("code") not in (0, "0", None):
        raise SystemExit(f"Login failed: code={body.get('code')} message={body.get('message')}")


def fetch_sales(client: httpx.Client, host: str, business_date: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 0
    while True:
        query = urlencode({"businessDate": business_date, "page": page, "size": 100})
        response = client.get(f"{host.rstrip('/')}/api/sales?{query}", timeout=60.0)
        response.raise_for_status()
        payload = response.json().get("data") or {}
        batch = payload.get("items") or payload.get("content") or []
        if not isinstance(batch, list):
            raise SystemExit("Unexpected /api/sales payload shape")
        items.extend(row for row in batch if isinstance(row, dict))
        total_pages = payload.get("totalPages")
        if total_pages is not None and page + 1 >= int(total_pages):
            break
        if len(batch) < 100:
            break
        page += 1
    return items


def write_csvs(out_dir: Path, store: str, business_date: str, sales: list[dict[str, Any]]) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    def is_refund_document(sale: dict[str, Any]) -> bool:
        # Orithos writes a separate COMPLETED row with linkedSaleId for the refund.
        if sale.get("linkedSaleId") is not None:
            return True
        return _money(sale.get("totalPrice")) < 0

    def is_refunded_original(sale: dict[str, Any]) -> bool:
        return str(sale.get("status") or "").upper() in {"REFUNDED", "REFUND"}

    sales_rows = [
        s for s in sales
        if str(s.get("status") or "").upper() == "COMPLETED" and not is_refund_document(s)
    ]
    refund_rows = [s for s in sales if is_refund_document(s)]
    refunded_originals = [s for s in sales if is_refunded_original(s)]

    gross = sum((_money(s.get("totalPrice")) for s in sales_rows), Decimal("0.00"))
    tax = sum((_money(s.get("totalTax")) for s in sales_rows), Decimal("0.00"))
    refund_gross = sum((_money(s.get("totalPrice")) for s in refund_rows), Decimal("0.00"))
    refund_tax = sum((_money(s.get("totalTax")) for s in refund_rows), Decimal("0.00"))
    net_movement_inc = (gross + refund_gross).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    net = (gross - tax).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    summary_path = out_dir / f"{store}_{business_date}_xero_day_summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "store",
                "business_date",
                "sale_count",
                "refund_row_count",
                "refunded_original_count",
                "gross_inc",
                "tax",
                "net_ex",
                "refund_inc",
                "refund_tax",
                "net_movement_inc",
                "payment_methods",
                "source",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "store": store,
                "business_date": business_date,
                "sale_count": len(sales_rows),
                "refund_row_count": len(refund_rows),
                "refunded_original_count": len(refunded_originals),
                "gross_inc": f"{gross:.2f}",
                "tax": f"{tax:.2f}",
                "net_ex": f"{net:.2f}",
                "refund_inc": f"{refund_gross:.2f}",
                "refund_tax": f"{refund_tax:.2f}",
                "net_movement_inc": f"{net_movement_inc:.2f}",
                "payment_methods": "not_exposed_on_/api/sales",
                "source": "orithos_native_/api/sales",
            }
        )

    lines_path = out_dir / f"{store}_{business_date}_xero_day_lines.csv"
    with lines_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "store",
                "business_date",
                "sale_id",
                "invoice_id",
                "status",
                "outlet_id",
                "total_price_inc",
                "total_tax",
                "total_rounding",
                "local_sold_at",
                "linked_sale_id",
            ],
        )
        writer.writeheader()
        for sale in sales:
            writer.writerow(
                {
                    "store": store,
                    "business_date": business_date,
                    "sale_id": sale.get("id"),
                    "invoice_id": sale.get("invoiceId"),
                    "status": sale.get("status"),
                    "outlet_id": sale.get("outletId"),
                    "total_price_inc": f"{_money(sale.get('totalPrice')):.2f}",
                    "total_tax": f"{_money(sale.get('totalTax')):.2f}",
                    "total_rounding": f"{_money(sale.get('totalRounding')):.2f}",
                    "local_sold_at": sale.get("localSoldAt") or sale.get("createdAt"),
                    "linked_sale_id": sale.get("linkedSaleId"),
                }
            )

    return {
        "store": store,
        "business_date": business_date,
        "sale_count": len(sales_rows),
        "refund_row_count": len(refund_rows),
        "refunded_original_count": len(refunded_originals),
        "gross_inc": float(gross),
        "tax": float(tax),
        "net_ex": float(net),
        "refund_inc": float(refund_gross),
        "refund_tax": float(refund_tax),
        "net_movement_inc": float(net_movement_inc),
        "summary_csv": str(summary_path),
        "lines_csv": str(lines_path),
        "limitations": [
            "payment method split not present on /api/sales",
            "not a live Xero API sync; owner imports/reviews CSV",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", required=True, choices=("skr", "demo"))
    parser.add_argument("--date", default=date.today().isoformat(), help="YYYY-MM-DD business date")
    parser.add_argument(
        "--out-dir",
        default=str(Path("docs") / "xero_exports"),
        help="Directory for CSV + evidence JSON",
    )
    args = parser.parse_args()

    if args.store == "skr":
        host = os.environ.get("ORITHOS_SKR_HOST", "https://skr.orithos.com.au")
        username = _env("ORITHOS_SKR_USER")
        password = _env("ORITHOS_SKR_PASS")
    else:
        host = os.environ.get("ORITHOS_DEMO_HOST", "https://demo.orithos.com.au")
        username = os.environ.get("ORITHOS_DEMO_USER") or "admin"
        password = _env("INITIAL_ADMIN_PASSWORD")

    out_dir = Path(args.out_dir)
    with httpx.Client(follow_redirects=True) as client:
        login(client, host, username, password)
        sales = fetch_sales(client, host, args.date)
        evidence = write_csvs(out_dir, args.store, args.date, sales)

    evidence_path = out_dir / f"UAT_XERO_DAY_CSV_{args.store.upper()}_{args.date}.json"
    evidence_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "evidence": str(evidence_path), **evidence}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
