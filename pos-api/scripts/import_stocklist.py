#!/usr/bin/env python3
"""One-time import of an AIPOS stocklist.csv into Orithos.

Source CSV is a Stock List export (not a single table). Each source product ID
may appear on multiple rows as price tiers (Quantity / Cost / Price).

Writes:
  category            — create missing names
  product             — one row per source ID (new bigint id)
  product_inventory   — quantity = cases * case_qty + items_on_hand
  product_price       — one row per price tier

Does not write Profit (derived) or the source UUID as product.id.

Usage (from repo root or pos-api):

  python pos-api/scripts/import_stocklist.py
  python pos-api/scripts/import_stocklist.py --apply
  python pos-api/scripts/import_stocklist.py --apply --update

Default is dry-run (no writes). DB settings come from pos-api/.env or env vars
(DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD), same as application.yml.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError as exc:  # pragma: no cover
    raise SystemExit("psycopg is required: pip install psycopg[binary]") from exc

SCRIPT_DIR = Path(__file__).resolve().parent
API_DIR = SCRIPT_DIR.parent
REPO_DIR = API_DIR.parent

DEFAULT_CSV = Path(r"E:\AIPOS合同\数据\stocklist.csv")
DEFAULT_OUTLET_ID = 1


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key, value)


def parse_decimal(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    text = raw.strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"invalid number: {raw!r}") from exc


def parse_decimal_or_zero(raw: str | None) -> Decimal:
    value = parse_decimal(raw)
    return value if value is not None else Decimal("0")


@dataclass
class PriceTier:
    quantity: Decimal
    cost: Decimal | None
    price: Decimal | None


@dataclass
class SourceProduct:
    source_id: str
    name: str
    category: str
    price_set: str
    case_quantity: Decimal
    cases_on_hand: Decimal
    items_on_hand: Decimal
    tiers: list[PriceTier] = field(default_factory=list)

    @property
    def stock_quantity(self) -> Decimal:
        return self.cases_on_hand * self.case_quantity + self.items_on_hand

    @property
    def unit_cost(self) -> Decimal | None:
        for tier in sorted(self.tiers, key=lambda t: t.quantity):
            if tier.cost is None:
                continue
            if tier.quantity == 1:
                return tier.cost
            return (tier.cost / tier.quantity).quantize(Decimal("0.0001"))
        return None

    def valid_price_tiers(self) -> list[PriceTier]:
        out: list[PriceTier] = []
        seen: set[Decimal] = set()
        for tier in self.tiers:
            if tier.quantity <= 0 or tier.price is None:
                continue
            if tier.quantity in seen:
                continue
            seen.add(tier.quantity)
            out.append(tier)
        return out


def group_source_rows(rows: list[dict[str, str]]) -> list[SourceProduct]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    order: list[str] = []
    for row in rows:
        source_id = (row.get("ID") or "").strip()
        if not source_id:
            raise ValueError("CSV row is missing ID")
        if source_id not in grouped:
            order.append(source_id)
        grouped[source_id].append(row)

    products: list[SourceProduct] = []
    for source_id in order:
        src_rows = grouped[source_id]
        first = src_rows[0]
        name = (first.get("Name") or "").strip()
        if not name:
            raise ValueError(f"source id {source_id} has empty Name")
        category = next(
            ((r.get("Category") or "").strip() for r in src_rows if (r.get("Category") or "").strip()),
            "",
        )
        price_set = next(
            ((r.get("Price Set") or "").strip() for r in src_rows if (r.get("Price Set") or "").strip()),
            "",
        )
        case_quantity = parse_decimal(first.get("Case Quantity"))
        if case_quantity is None or case_quantity <= 0:
            case_quantity = Decimal("1")
        product = SourceProduct(
            source_id=source_id,
            name=name[:255],
            category=category,
            price_set=price_set,
            case_quantity=case_quantity,
            cases_on_hand=parse_decimal_or_zero(first.get("Cases on hand")),
            items_on_hand=parse_decimal_or_zero(first.get("Items on hand")),
        )
        for row in src_rows:
            qty = parse_decimal(row.get("Quantity"))
            if qty is None:
                continue
            product.tiers.append(
                PriceTier(
                    quantity=qty,
                    cost=parse_decimal(row.get("Cost")),
                    price=parse_decimal(row.get("Price")),
                )
            )
        products.append(product)
    return products


def unique_name(base: str, used_lower: set[str]) -> str:
    candidate = base[:255]
    n = 2
    while candidate.lower() in used_lower:
        suffix = f" ({n})"
        candidate = f"{base[: 255 - len(suffix)]}{suffix}"
        n += 1
    used_lower.add(candidate.lower())
    return candidate


def connect():
    return psycopg.connect(os.environ["POSTGRESQL_URL"], row_factory=dict_row)


def last_id(cur, table: str) -> int:
    cur.execute("SELECT currval(pg_get_serial_sequence(%s, 'id')) AS id", (table,))
    return int(cur.fetchone()["id"])


def fetch_existing(cur, outlet_id: int) -> tuple[dict[str, int], dict[str, int], dict[str, int]]:
    cur.execute(
        "SELECT id, name FROM category WHERE deleted_at IS NULL AND outlet_id = %s",
        (outlet_id,),
    )
    categories = {row["name"].strip().lower(): int(row["id"]) for row in cur.fetchall() if row["name"]}

    cur.execute(
        "SELECT id, name FROM product WHERE deleted_at IS NULL AND outlet_id = %s",
        (outlet_id,),
    )
    products = {}
    for row in cur.fetchall():
        key = (row["name"] or "").strip().lower()
        if key and key not in products:
            products[key] = int(row["id"])

    cur.execute(
        "SELECT id, name FROM price_set WHERE outlet_id = %s",
        (outlet_id,),
    )
    price_sets = {row["name"].strip().lower(): int(row["id"]) for row in cur.fetchall() if row["name"]}
    return categories, products, price_sets


def ensure_category(cur, name: str, outlet_id: int, cache: dict[str, int], apply: bool) -> int | None:
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]
    if not apply:
        cache[key] = -1
        return cache[key]
    cur.execute(
        "INSERT INTO category (name, outlet_id) VALUES (%s, %s)",
        (name[:255], outlet_id),
    )
    cache[key] = last_id(cur, "category")
    return cache[key]


def ensure_price_set(cur, name: str, outlet_id: int, cache: dict[str, int], apply: bool) -> int | None:
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]
    if not apply:
        cache[key] = -1
        return cache[key]
    cur.execute(
        "INSERT INTO price_set (name, outlet_id) VALUES (%s, %s)",
        (name[:128], outlet_id),
    )
    cache[key] = last_id(cur, "price_set")
    return cache[key]


def insert_product(cur, product: SourceProduct, name: str, category_id: int | None, outlet_id: int) -> int:
    cur.execute(
        """
        INSERT INTO product
            (name, type, status, category_id, cost, case_quantity, track_inventory, outlet_id)
        VALUES
            (%s, 'STANDARD', 'ACTIVE', %s, %s, %s, 1, %s)
        """,
        (name, category_id, product.unit_cost, product.case_quantity, outlet_id),
    )
    return last_id(cur, "product")


def update_product(cur, product_id: int, product: SourceProduct, category_id: int | None) -> None:
    cur.execute(
        """
        UPDATE product
        SET category_id = %s, cost = %s, case_quantity = %s, track_inventory = 1
        WHERE id = %s
        """,
        (category_id, product.unit_cost, product.case_quantity, product_id),
    )


def upsert_inventory(cur, product_id: int, outlet_id: int, quantity: Decimal) -> None:
    cur.execute(
        """
        INSERT INTO product_inventory (product_id, outlet_id, quantity)
        VALUES (%s, %s, %s)
        ON CONFLICT (product_id, outlet_id) DO UPDATE SET quantity = EXCLUDED.quantity
        """,
        (product_id, outlet_id, quantity),
    )


def replace_prices(
    cur,
    product_id: int,
    outlet_id: int,
    price_set_id: int | None,
    tiers: list[PriceTier],
) -> None:
    cur.execute("DELETE FROM product_price WHERE product_id = %s AND outlet_id = %s", (product_id, outlet_id))
    for tier in tiers:
        cur.execute(
            """
            INSERT INTO product_price (product_id, price_set_id, quantity, price, outlet_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (product_id, price_set_id, tier.quantity, tier.price, outlet_id),
        )


def write_mapping(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["source_id", "name", "product_id", "action", "stock_quantity", "price_tiers"],
        )
        writer.writeheader()
        writer.writerows(rows)


def import_stocklist(args: argparse.Namespace) -> int:
    csv_path: Path = args.csv
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 2

    with csv_path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames or "ID" not in reader.fieldnames or "Name" not in reader.fieldnames:
            print("CSV must include ID and Name columns.", file=sys.stderr)
            return 2
        raw_rows = list(reader)

    products = group_source_rows(raw_rows)
    if args.limit:
        products = products[: args.limit]

    used_names: set[str] = set()
    planned: list[tuple[SourceProduct, str]] = []
    for product in products:
        name = unique_name(product.name, used_names)
        planned.append((product, name))

    conn = connect()
    created = skipped = updated = 0
    categories_created = 0
    mapping: list[dict[str, str]] = []

    try:
        with conn.cursor() as cur:
            categories, existing_products, price_sets = fetch_existing(cur, args.outlet_id)

            for product, assigned_name in planned:
                category_id = None
                if product.category:
                    before = product.category.lower() in categories
                    category_id = ensure_category(
                        cur, product.category, args.outlet_id, categories, args.apply
                    )
                    if not before:
                        categories_created += 1

                price_set_id = ensure_price_set(
                    cur, product.price_set, args.outlet_id, price_sets, args.apply
                )
                tiers = product.valid_price_tiers()
                existing_id = existing_products.get(assigned_name.lower())
                action = "create"

                if existing_id is not None:
                    if args.update:
                        action = "update"
                        if args.apply:
                            update_product(cur, existing_id, product, category_id)
                            upsert_inventory(cur, existing_id, args.outlet_id, product.stock_quantity)
                            replace_prices(cur, existing_id, args.outlet_id, price_set_id, tiers)
                        updated += 1
                        product_id = existing_id
                    else:
                        action = "skip"
                        skipped += 1
                        product_id = existing_id
                else:
                    if args.apply:
                        product_id = insert_product(
                            cur, product, assigned_name, category_id, args.outlet_id
                        )
                        upsert_inventory(cur, product_id, args.outlet_id, product.stock_quantity)
                        replace_prices(cur, product_id, args.outlet_id, price_set_id, tiers)
                        existing_products[assigned_name.lower()] = product_id
                    else:
                        product_id = 0
                    created += 1

                mapping.append(
                    {
                        "source_id": product.source_id,
                        "name": assigned_name,
                        "product_id": str(product_id or ""),
                        "action": action,
                        "stock_quantity": str(product.stock_quantity),
                        "price_tiers": str(len(tiers)),
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

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] CSV rows={len(raw_rows)} products={len(products)} outlet_id={args.outlet_id}")
    print(
        f"  create={created}  skip={skipped}  update={updated}  "
        f"new_categories={categories_created}"
    )
    print(f"  mapping={args.mapping}")
    if not args.apply:
        print("No database writes. Re-run with --apply to import.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import AIPOS stocklist.csv into Orithos")
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to stocklist.csv (default: {DEFAULT_CSV})",
    )
    parser.add_argument("--apply", action="store_true", help="Commit inserts/updates (default is dry-run)")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update existing products matched by name (cost, case qty, stock, prices)",
    )
    parser.add_argument("--outlet-id", type=int, default=DEFAULT_OUTLET_ID)
    parser.add_argument("--limit", type=int, default=0, help="Import only the first N products")
    parser.add_argument(
        "--mapping",
        type=Path,
        default=SCRIPT_DIR / "stocklist_import_mapping.csv",
        help="Write source_id -> product_id mapping CSV",
    )
    return parser


def main() -> int:
    load_dotenv(API_DIR / ".env")
    load_dotenv(REPO_DIR / ".env")
    return import_stocklist(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
