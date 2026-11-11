"""Read-only inventory of PostgreSQL relations and tenant ownership clues."""
from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from psycopg2 import sql


ROOT = Path(__file__).resolve().parents[2]


def load_dotenv_value(name: str) -> str | None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        match = re.match(rf"^\s*{re.escape(name)}\s*=\s*(.*?)\s*$", line)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    return None


def resolve_dsn(args: argparse.Namespace) -> str:
    dsn = os.environ.get(args.url_env) or load_dotenv_value(args.url_env)
    if not dsn:
        raise SystemExit(f"{args.url_env} is missing from environment and .env")
    return dsn.removeprefix("jdbc:")


def relation_inventory(cur, schema: str, exact_counts: bool) -> list[dict]:
    cur.execute(
        """
        SELECT c.relname,
               c.relkind,
               GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
               pg_relation_size(c.oid) AS heap_bytes,
               pg_indexes_size(c.oid) AS index_bytes,
               pg_total_relation_size(c.oid) AS total_bytes,
               COALESCE(s.n_live_tup, 0)::bigint AS live_rows_estimate
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
         WHERE n.nspname = %s AND c.relkind IN ('r', 'p')
         ORDER BY pg_total_relation_size(c.oid) DESC, c.relname
        """,
        (schema,),
    )
    relations = cur.fetchall()
    cur.execute(
        """
        SELECT c.table_name, c.column_name, c.data_type, c.udt_name,
               c.is_nullable, c.column_default,
               EXISTS (
                 SELECT 1
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu
                     ON tc.constraint_schema = kcu.constraint_schema
                    AND tc.constraint_name = kcu.constraint_name
                    AND tc.table_name = kcu.table_name
                  WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = c.table_schema
                    AND tc.table_name = c.table_name
                    AND kcu.column_name = c.column_name
               ) AS is_primary_key
          FROM information_schema.columns c
         WHERE c.table_schema = %s
         ORDER BY c.table_name, c.ordinal_position
        """,
        (schema,),
    )
    columns: dict[str, list[dict]] = {}
    for table, column, data_type, udt_name, nullable, default, is_primary_key in cur.fetchall():
        columns.setdefault(table, []).append(
            {
                "name": column,
                "type": udt_name or data_type,
                "nullable": nullable == "YES",
                "primary_key": is_primary_key,
                "default_present": default is not None,
            }
        )

    cur.execute(
        """
        SELECT tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.constraint_schema = kcu.constraint_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
           AND ccu.constraint_schema = tc.constraint_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = %s
         ORDER BY tc.table_name, kcu.column_name
        """,
        (schema,),
    )
    foreign_keys: dict[str, list[dict]] = {}
    for table, column, ref_table, ref_column in cur.fetchall():
        foreign_keys.setdefault(table, []).append(
            {"column": column, "references": f"{ref_table}.{ref_column}"}
        )

    output: list[dict] = []
    for name, kind, estimated, heap, indexes, total, live_estimate in relations:
        table_columns = columns.get(name, [])
        ownership = [c["name"] for c in table_columns if c["name"] in {"vendor_id", "outlet_id", "store_key"}]
        row = {
            "table": name,
            "kind": "partitioned" if kind == "p" else "table",
            "estimated_rows": int(max(estimated, live_estimate)),
            "heap_bytes": int(heap),
            "index_bytes": int(indexes),
            "total_bytes": int(total),
            "ownership_columns": ownership,
            "columns": table_columns,
            "foreign_keys": foreign_keys.get(name, []),
        }
        if exact_counts:
            cur.execute(sql.SQL("SELECT count(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(name)))
            row["exact_rows"] = int(cur.fetchone()[0])
            for owner_column in ownership:
                if owner_column not in {"vendor_id", "outlet_id"}:
                    continue
                cur.execute(
                    sql.SQL("SELECT {}::text, count(*) FROM {}.{} GROUP BY 1 ORDER BY 1").format(
                        sql.Identifier(owner_column), sql.Identifier(schema), sql.Identifier(name)
                    )
                )
                row[f"rows_by_{owner_column}"] = [
                    {"id": owner_id, "rows": int(count)} for owner_id, count in cur.fetchall()
                ]
        output.append(row)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url-env", default="POSTGRESQL_URL", help="environment variable holding the PostgreSQL DSN")
    parser.add_argument("--schema", default="public")
    parser.add_argument("--exact-counts", action="store_true", help="run exact counts and tenant-key groupings; can scan large tables")
    parser.add_argument("--output", type=Path, default=ROOT / ".local" / "tenant-data-inventory.json")
    args = parser.parse_args()

    try:
        conn = psycopg2.connect(resolve_dsn(args), connect_timeout=15, application_name="tenant-data-inventory")
    except psycopg2.Error as exc:
        print(f"status=BLOCKED connection_error={type(exc).__name__}")
        raise SystemExit(2) from None
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '120s'")
            cur.execute("SELECT current_database(), current_setting('server_version')")
            database, version = cur.fetchone()
            cur.execute("SELECT pg_database_size(current_database())")
            database_bytes = int(cur.fetchone()[0])
            tables = relation_inventory(cur, args.schema, args.exact_counts)
        conn.rollback()
    finally:
        conn.close()

    payload = {
        "status": "READ_ONLY_COMPLETE",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "database": database,
        "postgres_version": version,
        "schema": args.schema,
        "database_bytes": database_bytes,
        "exact_counts": args.exact_counts,
        "tables": tables,
        "limitations": [
            "Ownership columns and foreign keys are evidence for migration planning, not an approved row-copy map.",
            "Indirect ownership, polymorphic references, shared reference data, large objects, and orphan rows require domain review.",
            "Estimated rows are planner/statistics estimates; run ANALYZE before relying on them for capacity planning.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    total_tables = len(tables)
    scoped_tables = sum(bool(table["ownership_columns"]) for table in tables)
    print(
        f"status={payload['status']} schema={args.schema} tables={total_tables} "
        f"tables_with_owner_keys={scoped_tables} database_bytes={database_bytes} "
        f"exact_counts={str(args.exact_counts).lower()} output={args.output}"
    )


if __name__ == "__main__":
    main()
