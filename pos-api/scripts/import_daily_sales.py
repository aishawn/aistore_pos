#!/usr/bin/env python3
"""One-time import of an AIPOS daily product-sales CSV into Orithos.

The file is a matrix: product name × calendar day = dollar amount (not tickets).
Each day becomes one COMPLETED sale with one sale_item per product that sold.

Quantity is inferred from product_price tiers (greedy pack match, then unit price).
Transaction count will equal the number of days, not original POS tickets.
Revenue and units-sold reports will match the CSV totals as closely as possible.

Usage:

  python pos-api/scripts/import_daily_sales.py
  python pos-api/scripts/import_daily_sales.py --apply
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError as exc:  # pragma: no cover
    raise SystemExit("psycopg is required: pip install psycopg[binary]") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
API_DIR = SCRIPT_DIR.parent
REPO_DIR = API_DIR.parent

DEFAULT_CSV = Path(r"E:\AIPOS合同\数据\11eee669a538adcab8e30693f7f97d5b1788230110.csv")
DEFAULT_OUTLET_ID = 1
INVOICE_PREFIX = "AIPOS-"
IMPORT_NOTE = "Imported from AIPOS daily sales"
CENTS = Decimal("0.01")
QTY = Decimal("0.0001")


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def parse_money(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    text = raw.strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        return None
    if value == 0:
        return None
    return value.quantize(CENTS)


def norm_name(name: str) -> str:
    return " ".join(name.strip().split()).lower()


def infer_quantity(amount: Decimal, tiers: list[tuple[Decimal, Decimal]]) -> Decimal:
    remaining = abs(amount)
    qty = Decimal("0")
    ordered = sorted(
        ((q, p) for q, p in tiers if q > 0 and p > 0),
        key=lambda t: t[1],
        reverse=True,
    )
    for pack_qty, pack_price in ordered:
        packs = remaining // pack_price
        if packs:
            qty += pack_qty * packs
            remaining -= pack_price * packs
    if remaining > Decimal("0.02"):
        unit = next((p for q, p in ordered if q == 1), ordered[-1][1] if ordered else None)
        if unit and unit > 0:
            qty += (remaining / unit).quantize(QTY)
        elif qty == 0:
            qty = Decimal("1")
    if qty == 0:
        qty = Decimal("1")
    if amount < 0:
        qty = -qty
    return qty


@dataclass
class Line:
    date: str
    product_id: int
    name: str
    amount: Decimal
    quantity: Decimal
    cost: Decimal | None
    case_quantity: Decimal | None


def connect():
    return psycopg.connect(os.environ["POSTGRESQL_URL"], row_factory=dict_row)


def last_id(cur, table: str) -> int:
    cur.execute("SELECT currval(pg_get_serial_sequence(%s, 'id')) AS id", (table,))
    return int(cur.fetchone()["id"])


def load_catalog(cur, outlet_id: int):
    cur.execute(
        """
        SELECT id, name, cost, case_quantity
        FROM product
        WHERE deleted_at IS NULL AND outlet_id = %s
        """,
        (outlet_id,),
    )
    by_exact: dict[str, dict] = {}
    by_norm: dict[str, dict] = {}
    for row in cur.fetchall():
        name = (row["name"] or "").strip()
        rec = {
            "id": int(row["id"]),
            "cost": row["cost"],
            "case_quantity": row["case_quantity"],
            "tiers": [],
        }
        if name and name not in by_exact:
            by_exact[name] = rec
        key = norm_name(name) if name else ""
        if key and key not in by_norm:
            by_norm[key] = rec

    cur.execute(
        "SELECT product_id, quantity, price FROM product_price WHERE outlet_id = %s",
        (outlet_id,),
    )
    tiers_by_id: dict[int, list[tuple[Decimal, Decimal]]] = defaultdict(list)
    for row in cur.fetchall():
        qty = row["quantity"]
        price = row["price"]
        if qty and price:
            tiers_by_id[int(row["product_id"])].append((Decimal(qty), Decimal(price)))
    for rec in by_exact.values():
        rec["tiers"] = tiers_by_id.get(rec["id"], [])
    return by_exact, by_norm


def resolve_lookups(cur, outlet_id: int) -> tuple[int | None, int | None]:
    cur.execute(
        """
        SELECT id FROM register
        WHERE outlet_id = %s AND (deleted_at IS NULL)
        ORDER BY id LIMIT 1
        """,
        (outlet_id,),
    )
    row = cur.fetchone()
    register_id = int(row["id"]) if row else None
    cur.execute(
        """
        SELECT id FROM payment_method
        WHERE outlet_id = %s AND deleted_at IS NULL
        ORDER BY CASE WHEN type = 'CASH' THEN 0 ELSE 1 END, id
        LIMIT 1
        """,
        (outlet_id,),
    )
    row = cur.fetchone()
    payment_id = int(row["id"]) if row else None
    return register_id, payment_id


def parse_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise ValueError("CSV has no header")
        dates = [
            h for h in reader.fieldnames
            if h and len(h) == 10 and h[4] == "-" and h[7] == "-"
        ]
        rows = list(reader)
    return dates, rows


def build_lines(rows, dates, by_exact, by_norm) -> tuple[list[Line], list[str], int]:
    unmatched: dict[str, int] = {}
    skipped_empty = 0
    lines: list[Line] = []
    for row in rows:
        name = (row.get("Name") or row.get("product") or "").strip()
        if not name:
            skipped_empty += 1
            continue
        rec = by_exact.get(name) or by_norm.get(norm_name(name))
        if rec is None:
            unmatched[name] = unmatched.get(name, 0) + 1
            continue
        for day in dates:
            amount = parse_money(row.get(day))
            if amount is None:
                continue
            qty = infer_quantity(amount, rec["tiers"])
            unit_cost = rec["cost"]
            line_cost = None
            if unit_cost is not None:
                line_cost = (Decimal(unit_cost) * abs(qty)).quantize(Decimal("0.0001"))
                if amount < 0:
                    line_cost = -line_cost
            lines.append(
                Line(
                    date=day,
                    product_id=rec["id"],
                    name=name,
                    amount=amount,
                    quantity=qty,
                    cost=line_cost,
                    case_quantity=rec["case_quantity"],
                )
            )
    return lines, sorted(unmatched), skipped_empty


def delete_previous_import(cur, outlet_id: int) -> int:
    cur.execute(
        """
        SELECT id FROM sale
        WHERE outlet_id = %s AND invoice_id LIKE %s AND note = %s
        """,
        (outlet_id, INVOICE_PREFIX + "%", IMPORT_NOTE),
    )
    ids = [int(r["id"]) for r in cur.fetchall()]
    if not ids:
        return 0
    placeholders = ",".join(["%s"] * len(ids))
    cur.execute(f"DELETE FROM sale_item WHERE sale_id IN ({placeholders})", ids)
    cur.execute(f"DELETE FROM sale_payment WHERE sale_id IN ({placeholders})", ids)
    cur.execute(f"DELETE FROM sale WHERE id IN ({placeholders})", ids)
    return len(ids)


def insert_day(cur, day: str, day_lines: list[Line], register_id, payment_id, outlet_id: int) -> int:
    total_price = sum((ln.amount for ln in day_lines), Decimal("0")).quantize(CENTS)
    total_qty = sum((ln.quantity for ln in day_lines), Decimal("0"))
    total_cost = sum((ln.cost or Decimal("0") for ln in day_lines), Decimal("0"))
    sold_at = datetime.strptime(day + " 12:00:00", "%Y-%m-%d %H:%M:%S")
    invoice_id = f"{INVOICE_PREFIX}{day.replace('-', '')}"
    cur.execute(
        """
        INSERT INTO sale (
            register_id, status, invoice_id, note, total_quantity, total_cost,
            total_price, outstanding, created_at, outlet_id
        ) VALUES (%s, 'COMPLETED', %s, %s, %s, %s, %s, 0, %s, %s)
        """,
        (
            register_id,
            invoice_id,
            IMPORT_NOTE,
            int(total_qty.to_integral_value(rounding=ROUND_HALF_UP)),
            total_cost,
            total_price,
            sold_at,
            outlet_id,
        ),
    )
    sale_id = last_id(cur, "sale")
    item_rows = []
    for ln in day_lines:
        base = (ln.amount / ln.quantity).quantize(Decimal("0.0001")) if ln.quantity else ln.amount
        item_rows.append(
            (
                sale_id,
                ln.product_id,
                ln.quantity,
                ln.case_quantity,
                ln.cost,
                base,
                ln.amount,
                IMPORT_NOTE,
                outlet_id,
            )
        )
    cur.executemany(
        """
        INSERT INTO sale_item (
            sale_id, product_id, quantity, case_quantity, cost, base_price,
            total_price, note, outlet_id
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        item_rows,
    )
    pay_amount = total_price if total_price > 0 else Decimal("0.00")
    cur.execute(
        """
        INSERT INTO sale_payment (
            sale_id, payment_method_id, subtype, register_id, status,
            amount, process_time, outlet_id
        ) VALUES (%s, %s, 'Imported', %s, 'COMPLETED', %s, %s, %s)
        """,
        (sale_id, payment_id, register_id, pay_amount, sold_at, outlet_id),
    )
    return sale_id


def write_mapping(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["date", "sale_id", "lines", "amount"])
        writer.writeheader()
        writer.writerows(rows)


def import_daily_sales(args: argparse.Namespace) -> int:
    csv_path: Path = args.csv
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 2

    dates, rows = parse_csv(csv_path)
    if args.limit_days:
        dates = dates[: args.limit_days]
    if not dates:
        print("No date columns found in CSV.", file=sys.stderr)
        return 2

    conn = connect()
    mapping: list[dict[str, str]] = []
    try:
        with conn.cursor() as cur:
            by_exact, by_norm = load_catalog(cur, args.outlet_id)
            register_id, payment_id = resolve_lookups(cur, args.outlet_id)
            lines, unmatched, skipped_empty = build_lines(rows, dates, by_exact, by_norm)
            by_day: dict[str, list[Line]] = defaultdict(list)
            for ln in lines:
                by_day[ln.date].append(ln)

            removed = 0
            created = 0
            if args.apply:
                removed = delete_previous_import(cur, args.outlet_id)
                for day in dates:
                    day_lines = by_day.get(day) or []
                    if not day_lines:
                        continue
                    sale_id = insert_day(
                        cur, day, day_lines, register_id, payment_id, args.outlet_id
                    )
                    created += 1
                    mapping.append(
                        {
                            "date": day,
                            "sale_id": str(sale_id),
                            "lines": str(len(day_lines)),
                            "amount": str(sum((x.amount for x in day_lines), Decimal("0"))),
                        }
                    )
            else:
                for day in dates:
                    day_lines = by_day.get(day) or []
                    if not day_lines:
                        continue
                    created += 1
                    mapping.append(
                        {
                            "date": day,
                            "sale_id": "",
                            "lines": str(len(day_lines)),
                            "amount": str(sum((x.amount for x in day_lines), Decimal("0"))),
                        }
                    )

        if args.apply:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    write_mapping(args.mapping, mapping)
    total_amount = sum((Decimal(r["amount"]) for r in mapping), Decimal("0"))
    total_lines = sum(int(r["lines"]) for r in mapping)
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] CSV products={len(rows)} dates={len(dates)} outlet_id={args.outlet_id}")
    print(f"  sales={created}  lines={total_lines}  amount={total_amount}")
    print(f"  unmatched_products={len(unmatched)}  empty_name_rows={skipped_empty}")
    if args.apply:
        print(f"  replaced_previous={removed}")
    if unmatched:
        preview = ", ".join(unmatched[:8])
        extra = f" (+{len(unmatched) - 8} more)" if len(unmatched) > 8 else ""
        print(f"  unmatched: {preview}{extra}")
    print(f"  mapping={args.mapping}")
    if not args.apply:
        print("No database writes. Re-run with --apply to import.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import AIPOS daily sales CSV into Orithos")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--outlet-id", type=int, default=DEFAULT_OUTLET_ID)
    parser.add_argument("--limit-days", type=int, default=0)
    parser.add_argument(
        "--mapping",
        type=Path,
        default=SCRIPT_DIR / "daily_sales_import_mapping.csv",
    )
    return parser


def main() -> int:
    load_dotenv(API_DIR / ".env")
    load_dotenv(REPO_DIR / ".env")
    return import_daily_sales(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
