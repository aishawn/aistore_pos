#!/usr/bin/env python3
"""Import one OCR-read supplier tax invoice into purchase_order + order_product.

Invoice fields below were extracted from the Honour Destiny TAX INVOICE photo
(invoice Q1JY16, Savvy Cellars, 04/09/2026).

Usage:
  python pos-api/scripts/import_ocr_tax_invoice.py
  python pos-api/scripts/import_ocr_tax_invoice.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError as exc:  # pragma: no cover
    raise SystemExit("pymysql is required: pip install pymysql") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
API_DIR = SCRIPT_DIR.parent
REPO_DIR = API_DIR.parent
CENTS = Decimal("0.01")
QTY4 = Decimal("0.0001")

# Vision/OCR extraction from the uploaded Honour Destiny tax invoice.
OCR_INVOICE = {
    "supplier_name": "Honour Destiny Pty Ltd",
    "supplier_trading_as": "Honour Destiny",
    "abn": "59 155 246 245",
    "website": "www.honourdestiny.com.au",
    "bank_account_name": "Honour Destiny Pty Ltd",
    "bsb": "063 109",
    "account_number": "1116 9257",
    "invoice_number": "Q1JY16",
    "invoice_date": "2026-09-04",  # 04/09/2026 AU DD/MM/YYYY
    "document_type": "TAX INVOICE",
    "customer_name": "Savvy Cellars",
    "customer_address": "49 Civic Parade",
    "customer_suburb": "Altona",
    "customer_state": "VIC",
    "customer_postcode": "3018",
    "attn": "Felix",
    "customer_phone": "03 9398 3939",
    "trading_hours": "11:00-21:00",
    "wet_include": "0.00",
    "delivery_fee": "0.00",
    "gst_included": "189.09",
    "total_payable": "2080.00",
    "total_delivered_cases": 38,
    "lines": [
        {
            "description": "Asahi Super Dry Bottles 24PK",
            "brand": "Asahi",
            "pack_qty": 24,
            "qty_cases": 10,
            "unit_price": "54.00",
            "line_total": "540.00",
        },
        {
            "description": "Heineken Lager 500mL Cans 24PK",
            "brand": "Heineken",
            "pack_qty": 24,
            "qty_cases": 8,
            "unit_price": "65.00",
            "line_total": "520.00",
        },
        {
            "description": "Carlton Dry Bottles 24PK",
            "brand": "Carlton",
            "pack_qty": 24,
            "qty_cases": 10,
            "unit_price": "51.00",
            "line_total": "510.00",
        },
        {
            "description": "Carlton Dry Cans 24PK",
            "brand": "Carlton",
            "pack_qty": 24,
            "qty_cases": 10,
            "unit_price": "51.00",
            "line_total": "510.00",
        },
    ],
}


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def money(raw: str) -> Decimal:
    return Decimal(raw.replace("$", "").replace(",", "")).quantize(CENTS, rounding=ROUND_HALF_UP)


def qty(raw) -> Decimal:
    return Decimal(str(raw)).quantize(QTY4)


def connect():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", "root"),
        database=os.environ.get("DB_NAME", "orithos"),
        charset="utf8mb4",
        autocommit=False,
        cursorclass=DictCursor,
    )


def fetch_id(cur, sql: str, args=()):
    cur.execute(sql, args)
    row = cur.fetchone()
    return int(row["id"]) if row and row.get("id") is not None else None


def ensure_named(cur, table: str, name: str, outlet_id: int) -> int:
    existing = fetch_id(
        cur,
        f"SELECT id FROM {table} WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(%s) LIMIT 1",
        (name,),
    )
    if existing:
        return existing
    cur.execute(f"INSERT INTO {table} (name, outlet_id) VALUES (%s, %s)", (name, outlet_id))
    return int(cur.lastrowid)


def ensure_supplier(cur, invoice: dict, outlet_id: int) -> int:
    existing = fetch_id(
        cur,
        """
        SELECT id FROM supplier
        WHERE deleted_at IS NULL
          AND (LOWER(TRIM(name)) = LOWER(%s)
               OR REPLACE(business_number, ' ', '') = REPLACE(%s, ' ', ''))
        LIMIT 1
        """,
        (invoice["supplier_name"], invoice["abn"]),
    )
    if existing:
        cur.execute(
            """
            UPDATE supplier
            SET business_number = COALESCE(NULLIF(business_number, ''), %s),
                account_number = COALESCE(NULLIF(account_number, ''), %s),
                comments = COALESCE(NULLIF(comments, ''), %s),
                status = COALESCE(status, 'ACTIVE')
            WHERE id = %s
            """,
            (
                invoice["abn"],
                invoice["account_number"].replace(" ", ""),
                f"BSB {invoice['bsb']}. {invoice['website']}",
                existing,
            ),
        )
        return existing

    cur.execute(
        """
        INSERT INTO contact (website, outlet_id)
        VALUES (%s, %s)
        """,
        (invoice["website"], outlet_id),
    )
    contact_id = int(cur.lastrowid)
    cur.execute(
        """
        INSERT INTO supplier (
            name, status, contact_id, business_number, account_number, comments,
            default_order_tax, freight_included_on_invoices, outlet_id
        ) VALUES (%s, 'ACTIVE', %s, %s, %s, %s, 'INCLUSIVE', 1, %s)
        """,
        (
            invoice["supplier_name"],
            contact_id,
            invoice["abn"],
            invoice["account_number"].replace(" ", ""),
            f"BSB {invoice['bsb']}. Payment REF: quote invoice number. {invoice['website']}",
            outlet_id,
        ),
    )
    return int(cur.lastrowid)


def ensure_product(cur, line: dict, *, supplier_id: int, category_id: int, family_id: int,
                   tax_rate_id: int | None, outlet_id: int) -> tuple[int, bool]:
    name = line["description"]
    brand_id = ensure_named(cur, "brand", line["brand"], outlet_id)
    case_qty = qty(line["pack_qty"])
    case_cost = money(line["unit_price"])
    unit_cost = (case_cost / case_qty).quantize(QTY4, rounding=ROUND_HALF_UP)

    existing = fetch_id(
        cur,
        "SELECT id FROM product WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(%s) LIMIT 1",
        (name,),
    )
    created = False
    if existing:
        product_id = existing
        cur.execute(
            """
            UPDATE product
            SET cost = %s, case_quantity = %s, brand_id = COALESCE(brand_id, %s),
                category_id = COALESCE(category_id, %s), family_id = COALESCE(family_id, %s),
                core_supplier_id = COALESCE(core_supplier_id, %s),
                cost_tax_rate_id = COALESCE(cost_tax_rate_id, %s)
            WHERE id = %s
            """,
            (unit_cost, case_qty, brand_id, category_id, family_id, supplier_id, tax_rate_id, product_id),
        )
    else:
        cur.execute(
            """
            INSERT INTO product (
                name, type, status, category_id, brand_id, family_id, core_supplier_id,
                tax_rate_id, cost_tax_rate_id, cost, case_quantity, track_inventory, outlet_id
            ) VALUES (%s, 'STANDARD', 'ACTIVE', %s, %s, %s, %s, %s, %s, %s, %s, 1, %s)
            """,
            (
                name, category_id, brand_id, family_id, supplier_id,
                tax_rate_id, tax_rate_id, unit_cost, case_qty, outlet_id,
            ),
        )
        product_id = int(cur.lastrowid)
        created = True

    cur.execute(
        """
        SELECT id FROM product_supplier
        WHERE product_id = %s AND supplier_id = %s
        LIMIT 1
        """,
        (product_id, supplier_id),
    )
    if not cur.fetchone():
        cur.execute(
            "INSERT INTO product_supplier (product_id, supplier_id, code, outlet_id) VALUES (%s, %s, %s, %s)",
            (product_id, supplier_id, name, outlet_id),
        )
    return product_id, created


def import_invoice(apply: bool) -> int:
    invoice = OCR_INVOICE
    print("OCR fields:")
    print(json.dumps(invoice, indent=2, ensure_ascii=False))

    conn = connect()
    try:
        with conn.cursor() as cur:
            invoice_number = invoice["invoice_number"]
            existing_order = fetch_id(
                cur,
                "SELECT id FROM purchase_order WHERE invoice_number = %s LIMIT 1",
                (invoice_number,),
            )
            if existing_order:
                print(f"Invoice {invoice_number} already exists as purchase_order.id={existing_order}")
                return 0

            outlet_id = fetch_id(
                cur,
                """
                SELECT id FROM outlet
                WHERE deleted_at IS NULL
                  AND (LOWER(name) LIKE %s OR LOWER(name) LIKE %s)
                ORDER BY id
                LIMIT 1
                """,
                ("%savvy%", "%altona%"),
            ) or fetch_id(cur, "SELECT id FROM outlet WHERE deleted_at IS NULL ORDER BY id LIMIT 1")
            if not outlet_id:
                raise SystemExit("No outlet found. Seed or create an outlet first.")

            supplier_id = ensure_supplier(cur, invoice, outlet_id)
            category_id = ensure_named(cur, "category", "Beer", outlet_id)
            family_id = ensure_named(cur, "family", "Beer", outlet_id)
            tax_rate_id = fetch_id(
                cur,
                "SELECT id FROM tax_rate WHERE deleted_at IS NULL AND is_default = 1 ORDER BY id LIMIT 1",
            )

            notes = (
                f"Customer: {invoice['customer_name']}, Attn {invoice['attn']}\n"
                f"{invoice['customer_address']}, {invoice['customer_suburb']} "
                f"{invoice['customer_state']} {invoice['customer_postcode']}\n"
                f"Tel: {invoice['customer_phone']}\n"
                f"Total delivered cases: {invoice['total_delivered_cases']}\n"
                f"Delivery fee: ${invoice['delivery_fee']}\n"
                f"GST included: ${invoice['gst_included']}\n"
                f"ABN: {invoice['abn']}\n"
                f"Pay {invoice['bank_account_name']} BSB {invoice['bsb']} Acc {invoice['account_number']}"
            )
            internal_notes = (
                "Imported from Honour Destiny TAX INVOICE photo via OCR. "
                f"WET include ${invoice['wet_include']}."
            )
            total = money(invoice["total_payable"])

            cur.execute(
                """
                INSERT INTO purchase_order (
                    type, status, from_id, to_id, order_date, entered_as, invoice_number,
                    notes, internal_notes, include_freight, total_cost, expected_total,
                    line_count, received_at, outlet_id
                ) VALUES (
                    'ORDER', 'RECEIVED', %s, %s, %s, 'INCLUSIVE', %s,
                    %s, %s, 0, %s, %s, %s, NOW(), %s
                )
                """,
                (
                    supplier_id,
                    outlet_id,
                    invoice["invoice_date"],
                    invoice_number,
                    notes,
                    internal_notes,
                    total,
                    total,
                    len(invoice["lines"]),
                    outlet_id,
                ),
            )
            order_id = int(cur.lastrowid)

            created_products = []
            for line in invoice["lines"]:
                product_id, created = ensure_product(
                    cur,
                    line,
                    supplier_id=supplier_id,
                    category_id=category_id,
                    family_id=family_id,
                    tax_rate_id=tax_rate_id,
                    outlet_id=outlet_id,
                )
                if created:
                    created_products.append(line["description"])
                cases = qty(line["qty_cases"])
                pack = qty(line["pack_qty"])
                case_cost = money(line["unit_price"])
                units = (cases * pack).quantize(QTY4)
                cur.execute(
                    """
                    INSERT INTO order_product (
                        order_id, product_id, supplier_id, supplier_code, case_quantity,
                        ordered_quantity, received_quantity, base_cost, ordered_cost,
                        fees, freight, rebate, outlet_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 0, 0, %s)
                    """,
                    (
                        order_id,
                        product_id,
                        supplier_id,
                        line["description"],
                        pack,
                        cases,
                        cases,
                        case_cost,
                        case_cost,
                        outlet_id,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO product_inventory (product_id, outlet_id, quantity)
                    VALUES (%s, %s, %s)
                    ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
                    """,
                    (product_id, outlet_id, units),
                )
                unit_cost = (case_cost / pack).quantize(QTY4, rounding=ROUND_HALF_UP)
                cur.execute(
                    """
                    INSERT INTO product_cost (product_id, outlet_id, cost, last_cost, average_cost)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE last_cost = VALUES(last_cost), cost = VALUES(cost)
                    """,
                    (product_id, outlet_id, unit_cost, unit_cost, unit_cost),
                )

            if apply:
                conn.commit()
            else:
                conn.rollback()

        mode = "APPLY" if apply else "DRY-RUN"
        print(f"[{mode}] purchase_order.id={order_id} invoice={invoice_number} "
              f"supplier_id={supplier_id} outlet_id={outlet_id} total=${total}")
        if created_products:
            print("  created products:", ", ".join(created_products))
        if not apply:
            print("No database writes. Re-run with --apply to import.")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def main() -> int:
    load_dotenv(API_DIR / ".env")
    load_dotenv(REPO_DIR / ".env")
    parser = argparse.ArgumentParser(description="Import OCR tax invoice Q1JY16")
    parser.add_argument("--apply", action="store_true", help="Commit to database")
    args = parser.parse_args()
    return import_invoice(args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
