#!/usr/bin/env python3
"""One-time import of an AIPOS customer CSV into Orithos.

Writes:
  customer_group   — create missing group names (e.g. Members)
  contact          — billing and delivery addresses
  customer         — one row per source uuid (new bigint id)
  customer_email   — split billing/delivery emails on ';' or ','

Source uuid is not used as customer.id. Match existing rows by customer code.

Usage:

  python pos-api/scripts/import_customers.py
  python pos-api/scripts/import_customers.py --apply --update
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
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

DEFAULT_CSV = Path(r"E:\AIPOS合同\数据\6f4d95fe-5d6a-4b47-b792-ba1bf0650d9f.csv")
DEFAULT_OUTLET_ID = 1


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


def blank_to_none(raw: str | None, max_len: int | None = None) -> str | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    if max_len:
        text = text[:max_len]
    return text


def parse_bool(raw: str | None, default: bool = False) -> int:
    if raw is None or not raw.strip():
        return 1 if default else 0
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "y", "t"}:
        return 1
    if value in {"0", "false", "no", "n", "f"}:
        return 0
    return 1 if default else 0


def parse_decimal(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    text = raw.strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_decimal_or_zero(raw: str | None) -> Decimal:
    value = parse_decimal(raw)
    return value if value is not None else Decimal("0")


def parse_date(raw: str | None):
    text = blank_to_none(raw)
    if not text or text.startswith("0000-00-00"):
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_datetime(raw: str | None):
    text = blank_to_none(raw)
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).replace(tzinfo=None)
    except ValueError:
        return None


def split_emails(*raws: str | None) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for raw in raws:
        if not raw:
            continue
        for part in re.split(r"[;,]", raw):
            email = part.strip()
            if not email or "@" not in email:
                continue
            key = email.lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(email[:255])
    return found


def build_name(first_name: str | None, last_name: str | None, company: str | None) -> str:
    person = " ".join(p for p in (first_name, last_name) if p).strip()
    if person:
        return person[:255]
    if company:
        return company[:255]
    return "Untitled Customer"


@dataclass
class Address:
    street1: str | None
    street2: str | None
    suburb: str | None
    city: str | None
    postcode: str | None
    region: str | None
    country: str | None
    email: str | None
    fax: str | None
    phone: str | None
    mobile: str | None
    website: str | None
    twitter: str | None
    facebook: str | None

    def is_blank(self) -> bool:
        return not any(
            (
                self.street1,
                self.street2,
                self.suburb,
                self.city,
                self.postcode,
                self.region,
                self.country,
                self.email,
                self.fax,
                self.phone,
                self.mobile,
                self.website,
                self.twitter,
                self.facebook,
            )
        )


def address_from_row(row: dict[str, str], prefix: str) -> Address:
    emails = split_emails(row.get(f"{prefix}_email"))
    return Address(
        street1=blank_to_none(row.get(f"{prefix}_address_street_1"), 255),
        street2=blank_to_none(row.get(f"{prefix}_address_street_2"), 255),
        suburb=blank_to_none(row.get(f"{prefix}_address_suburb"), 128),
        city=blank_to_none(row.get(f"{prefix}_address_city"), 128),
        postcode=blank_to_none(row.get(f"{prefix}_address_postcode"), 16),
        region=blank_to_none(row.get(f"{prefix}_address_state"), 128),
        country=blank_to_none(row.get(f"{prefix}_address_country"), 128),
        email=emails[0] if emails else None,
        fax=blank_to_none(row.get(f"{prefix}_fax"), 64),
        phone=blank_to_none(row.get(f"{prefix}_phone"), 64),
        mobile=blank_to_none(row.get(f"{prefix}_mobile"), 64),
        website=blank_to_none(row.get(f"{prefix}_website"), 255),
        twitter=blank_to_none(row.get(f"{prefix}_twitter"), 255),
        facebook=blank_to_none(row.get(f"{prefix}_facebook"), 255),
    )


@dataclass
class SourceCustomer:
    source_id: str
    first_name: str | None
    last_name: str | None
    code: str | None
    company: str | None
    business_number: str | None
    birthday: object | None
    gender: str | None
    allow_marketing_emails: int
    invoice_message: str | None
    comments: str | None
    loyalty_enabled: int
    loyalty_rate: Decimal | None
    loyalty_points: Decimal
    disable_promotions: int
    require_order_reference: int
    account_limit: Decimal | None
    current_owing: Decimal
    override_customer_group: int
    created_at: datetime | None
    group_name: str | None
    emails: list[str]
    billing: Address
    delivery: Address

    @property
    def name(self) -> str:
        return build_name(self.first_name, self.last_name, self.company)

    @property
    def email(self) -> str | None:
        return self.emails[0] if self.emails else None

    @property
    def phone(self) -> str | None:
        return self.billing.phone or self.delivery.phone

    @property
    def mobile(self) -> str | None:
        return self.billing.mobile or self.delivery.mobile

    @property
    def fax(self) -> str | None:
        return self.billing.fax or self.delivery.fax


def parse_row(row: dict[str, str]) -> SourceCustomer:
    source_id = (row.get("uuid") or "").strip()
    if not source_id:
        raise ValueError("CSV row is missing uuid")
    first_name = blank_to_none(row.get("first_name"), 128)
    last_name = blank_to_none(row.get("last_name"), 128)
    billing = address_from_row(row, "billing")
    delivery = address_from_row(row, "delivery")
    emails = split_emails(row.get("billing_email"), row.get("delivery_email"))
    return SourceCustomer(
        source_id=source_id,
        first_name=first_name,
        last_name=last_name,
        code=blank_to_none(row.get("code"), 64),
        company=blank_to_none(row.get("company"), 255),
        business_number=blank_to_none(row.get("business_number"), 64),
        birthday=parse_date(row.get("birthday")),
        gender=blank_to_none(row.get("gender"), 32),
        allow_marketing_emails=parse_bool(row.get("allow_marketing_emails"), default=True),
        invoice_message=blank_to_none(row.get("invoice_message")),
        comments=blank_to_none(row.get("comments")),
        loyalty_enabled=parse_bool(row.get("loyalty")),
        loyalty_rate=parse_decimal(row.get("loyalty_rate")),
        loyalty_points=parse_decimal_or_zero(row.get("loyalty_points")),
        disable_promotions=parse_bool(row.get("disable_promotions")),
        require_order_reference=parse_bool(row.get("require_order_reference")),
        account_limit=parse_decimal(row.get("account_limit")),
        current_owing=parse_decimal_or_zero(row.get("current_owing")),
        override_customer_group=parse_bool(row.get("override_customer_group")),
        created_at=parse_datetime(row.get("created_at")),
        group_name=blank_to_none(row.get("customer_group_name"), 255),
        emails=emails,
        billing=billing,
        delivery=delivery,
    )


def unique_code(base: str | None, source_id: str, used_lower: set[str]) -> str:
    candidate = (base or f"IMP-{source_id[-8:]}").strip() or f"IMP-{source_id[-8:]}"
    candidate = candidate[:64]
    n = 2
    while candidate.lower() in used_lower:
        suffix = f"-{n}"
        candidate = f"{candidate[: 64 - len(suffix)]}{suffix}"
        n += 1
    used_lower.add(candidate.lower())
    return candidate


def connect():
    return psycopg.connect(os.environ["POSTGRESQL_URL"], row_factory=dict_row)


def last_id(cur, table: str) -> int:
    cur.execute("SELECT currval(pg_get_serial_sequence(%s, 'id')) AS id", (table,))
    return int(cur.fetchone()["id"])


def fetch_existing(cur, outlet_id: int):
    cur.execute(
        "SELECT id, name FROM customer_group WHERE deleted_at IS NULL AND outlet_id = %s",
        (outlet_id,),
    )
    groups = {row["name"].strip().lower(): int(row["id"]) for row in cur.fetchall() if row["name"]}

    cur.execute(
        """
        SELECT id, code, billing_contact_id, delivery_contact_id
        FROM customer
        WHERE deleted_at IS NULL AND outlet_id = %s
        """,
        (outlet_id,),
    )
    customers = {}
    for row in cur.fetchall():
        code = (row["code"] or "").strip().lower()
        if code and code not in customers:
            customers[code] = {
                "id": int(row["id"]),
                "billing_contact_id": row["billing_contact_id"],
                "delivery_contact_id": row["delivery_contact_id"],
            }

    cur.execute(
        """
        SELECT ce.email, ce.customer_id
        FROM customer_email ce
        INNER JOIN customer c ON c.id = ce.customer_id
        WHERE c.deleted_at IS NULL AND ce.customer_deleted_at IS NULL AND c.outlet_id = %s
        """,
        (outlet_id,),
    )
    emails = {}
    for row in cur.fetchall():
        key = (row["email"] or "").strip().lower()
        if key and key not in emails:
            emails[key] = int(row["customer_id"])
    return groups, customers, emails


def ensure_group(cur, name: str, outlet_id: int, cache: dict[str, int], apply: bool) -> int | None:
    if not name:
        return None
    key = name.lower()
    if key in cache:
        return cache[key]
    if not apply:
        cache[key] = -1
        return cache[key]
    cur.execute(
        "INSERT INTO customer_group (name, outlet_id) VALUES (%s, %s)",
        (name[:255], outlet_id),
    )
    cache[key] = last_id(cur, "customer_group")
    return cache[key]


def upsert_contact(cur, existing_id, addr: Address, outlet_id: int) -> int | None:
    if addr.is_blank():
        return existing_id
    values = (
        addr.street1,
        addr.street2,
        addr.suburb,
        addr.city,
        addr.postcode,
        addr.region,
        addr.country,
        addr.email,
        addr.fax,
        addr.phone,
        addr.mobile,
        addr.website,
        addr.twitter,
        addr.facebook,
        outlet_id,
    )
    if existing_id:
        cur.execute(
            """
            UPDATE contact
            SET address_street1=%s, address_street2=%s, address_suburb=%s, address_city=%s,
                address_postcode=%s, address_region=%s, address_country=%s, email=%s, fax=%s,
                phone=%s, mobile=%s, website=%s, twitter=%s, facebook=%s, outlet_id=%s
            WHERE id=%s
            """,
            values + (existing_id,),
        )
        return int(existing_id)
    cur.execute(
        """
        INSERT INTO contact (
            address_street1, address_street2, address_suburb, address_city, address_postcode,
            address_region, address_country, email, fax, phone, mobile, website, twitter,
            facebook, outlet_id
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        values,
    )
    return last_id(cur, "contact")


def insert_customer(cur, src: SourceCustomer, code: str, group_id, billing_id, delivery_id, outlet_id: int) -> int:
    cur.execute(
        """
        INSERT INTO customer (
            name, first_name, last_name, code, company, business_number, birthday, gender,
            billing_contact_id, delivery_contact_id, email, phone, mobile, fax,
            allow_marketing_emails, invoice_message, comments, customer_group_id,
            override_customer_group, loyalty_enabled, loyalty_rate, loyalty_points,
            disable_promotions, require_order_reference, account_limit, current_owing,
            created_at, outlet_id
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,
            COALESCE(%s, CURRENT_TIMESTAMP), %s
        )
        """,
        (
            src.name,
            src.first_name,
            src.last_name,
            code,
            src.company,
            src.business_number,
            src.birthday,
            src.gender,
            billing_id,
            delivery_id,
            src.email,
            src.phone,
            src.mobile,
            src.fax,
            src.allow_marketing_emails,
            src.invoice_message,
            src.comments,
            group_id,
            src.override_customer_group,
            src.loyalty_enabled,
            src.loyalty_rate,
            src.loyalty_points,
            src.disable_promotions,
            src.require_order_reference,
            src.account_limit,
            src.current_owing,
            src.created_at,
            outlet_id,
        ),
    )
    return last_id(cur, "customer")


def update_customer(cur, customer_id: int, src: SourceCustomer, code: str, group_id, billing_id, delivery_id) -> None:
    cur.execute(
        """
        UPDATE customer
        SET name=%s, first_name=%s, last_name=%s, code=%s, company=%s, business_number=%s,
            birthday=%s, gender=%s, billing_contact_id=%s, delivery_contact_id=%s,
            email=%s, phone=%s, mobile=%s, fax=%s, allow_marketing_emails=%s,
            invoice_message=%s, comments=%s, customer_group_id=%s, override_customer_group=%s,
            loyalty_enabled=%s, loyalty_rate=%s, loyalty_points=%s, disable_promotions=%s,
            require_order_reference=%s, account_limit=%s, current_owing=%s
        WHERE id=%s
        """,
        (
            src.name,
            src.first_name,
            src.last_name,
            code,
            src.company,
            src.business_number,
            src.birthday,
            src.gender,
            billing_id,
            delivery_id,
            src.email,
            src.phone,
            src.mobile,
            src.fax,
            src.allow_marketing_emails,
            src.invoice_message,
            src.comments,
            group_id,
            src.override_customer_group,
            src.loyalty_enabled,
            src.loyalty_rate,
            src.loyalty_points,
            src.disable_promotions,
            src.require_order_reference,
            src.account_limit,
            src.current_owing,
            customer_id,
        ),
    )


def replace_emails(cur, customer_id: int, emails: list[str], email_owners: dict[str, int], outlet_id: int) -> int:
    cur.execute("DELETE FROM customer_email WHERE customer_id = %s", (customer_id,))
    written = 0
    for order, email in enumerate(emails):
        key = email.lower()
        owner = email_owners.get(key)
        if owner is not None and owner != customer_id:
            continue
        cur.execute(
            """
            INSERT INTO customer_email (customer_id, email, sort_order, outlet_id)
            VALUES (%s, %s, %s, %s)
            """,
            (customer_id, email, order, outlet_id),
        )
        email_owners[key] = customer_id
        written += 1
    return written


def write_mapping(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["source_id", "code", "name", "customer_id", "action", "group", "emails"],
        )
        writer.writeheader()
        writer.writerows(rows)


def import_customers(args: argparse.Namespace) -> int:
    csv_path: Path = args.csv
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}", file=sys.stderr)
        return 2

    with csv_path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames or "uuid" not in reader.fieldnames:
            print("CSV must include a uuid column.", file=sys.stderr)
            return 2
        raw_rows = list(reader)

    sources = [parse_row(row) for row in raw_rows]
    if args.limit:
        sources = sources[: args.limit]

    conn = connect()
    created = skipped = updated = 0
    groups_created = 0
    mapping: list[dict[str, str]] = []

    try:
        with conn.cursor() as cur:
            groups, existing, email_owners = fetch_existing(cur, args.outlet_id)
            used_codes = set(existing.keys())
            planned: list[tuple[SourceCustomer, str]] = []
            for src in sources:
                if src.code:
                    code = src.code
                    used_codes.add(code.lower())
                else:
                    code = unique_code(None, src.source_id, used_codes)
                planned.append((src, code))

            for src, code in planned:
                group_id = None
                if src.group_name:
                    before = src.group_name.lower() in groups
                    group_id = ensure_group(cur, src.group_name, args.outlet_id, groups, args.apply)
                    if not before:
                        groups_created += 1

                existing_row = existing.get(code.lower())
                action = "create"
                customer_id = 0

                if existing_row is not None:
                    customer_id = existing_row["id"]
                    if args.update:
                        action = "update"
                        if args.apply:
                            billing_id = upsert_contact(
                                cur, existing_row["billing_contact_id"], src.billing, args.outlet_id
                            )
                            delivery_id = upsert_contact(
                                cur, existing_row["delivery_contact_id"], src.delivery, args.outlet_id
                            )
                            update_customer(cur, customer_id, src, code, group_id, billing_id, delivery_id)
                            replace_emails(cur, customer_id, src.emails, email_owners, args.outlet_id)
                        updated += 1
                    else:
                        action = "skip"
                        skipped += 1
                else:
                    if args.apply:
                        billing_id = upsert_contact(cur, None, src.billing, args.outlet_id)
                        delivery_id = upsert_contact(cur, None, src.delivery, args.outlet_id)
                        customer_id = insert_customer(
                            cur, src, code, group_id, billing_id, delivery_id, args.outlet_id
                        )
                        replace_emails(cur, customer_id, src.emails, email_owners, args.outlet_id)
                        existing[code.lower()] = {
                            "id": customer_id,
                            "billing_contact_id": billing_id,
                            "delivery_contact_id": delivery_id,
                        }
                    created += 1

                mapping.append(
                    {
                        "source_id": src.source_id,
                        "code": code,
                        "name": src.name,
                        "customer_id": str(customer_id or ""),
                        "action": action,
                        "group": src.group_name or "",
                        "emails": str(len(src.emails)),
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
    print(f"[{mode}] CSV rows={len(raw_rows)} customers={len(sources)} outlet_id={args.outlet_id}")
    print(
        f"  create={created}  skip={skipped}  update={updated}  "
        f"new_groups={groups_created}"
    )
    print(f"  mapping={args.mapping}")
    if not args.apply:
        print("No database writes. Re-run with --apply to import.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import AIPOS customer CSV into Orithos")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--apply", action="store_true", help="Commit inserts/updates (default is dry-run)")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update existing customers matched by code",
    )
    parser.add_argument("--outlet-id", type=int, default=DEFAULT_OUTLET_ID)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--mapping",
        type=Path,
        default=SCRIPT_DIR / "customer_import_mapping.csv",
    )
    return parser


def main() -> int:
    load_dotenv(API_DIR / ".env")
    load_dotenv(REPO_DIR / ".env")
    return import_customers(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
