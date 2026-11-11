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


def connect_readonly(dsn: str):
    candidates: list[str] = []
    for mode in ("require", "prefer", "disable"):
        if re.search(r"(?:\?|&)sslmode=", dsn):
            candidate = re.sub(r"([?&]sslmode=)[^&]*", rf"\g<1>{mode}", dsn)
        else:
            separator = "&" if "?" in dsn else "?"
            candidate = f"{dsn}{separator}sslmode={mode}"
        if candidate not in candidates:
            candidates.append(candidate)

    errors: list[str] = []
    for candidate in candidates:
        try:
            return psycopg2.connect(
                candidate,
                connect_timeout=6,
                application_name="tenant-data-inventory",
            )
        except psycopg2.Error as exc:
            errors.append(type(exc).__name__)
    raise psycopg2.OperationalError(
        f"connection failed for {len(candidates)} SSL modes ({','.join(errors)})"
    )


def relation_inventory(
    cur,
    schema: str,
    exact_counts: bool,
    selected_tables: set[str] | None,
    group_by: list[str],
) -> list[dict]:
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

    cur.execute(
        """
        SELECT tablename, indexname, indexdef
          FROM pg_indexes
         WHERE schemaname = %s
         ORDER BY tablename, indexname
        """,
        (schema,),
    )
    indexes: dict[str, list[dict]] = {}
    for table, name, definition in cur.fetchall():
        indexes.setdefault(table, []).append({"name": name, "definition": definition})

    available_tables = {row[0] for row in relations}
    if selected_tables:
        missing = selected_tables - available_tables
        if missing:
            raise SystemExit("unknown table name(s): " + ", ".join(sorted(missing)))
        relations = [row for row in relations if row[0] in selected_tables]

    output: list[dict] = []
    for name, kind, estimated, heap, index_bytes, total, live_estimate in relations:
        table_columns = columns.get(name, [])
        ownership = [
            c["name"]
            for c in table_columns
            if c["name"] in {"vendor_id", "tenant_id", "company_id", "outlet_id", "store_key"}
        ]
        row = {
            "table": name,
            "kind": "partitioned" if kind == "p" else "table",
            "estimated_rows": int(max(estimated, live_estimate)),
            "heap_bytes": int(heap),
            "index_bytes": int(index_bytes),
            "total_bytes": int(total),
            "ownership_columns": ownership,
            "columns": table_columns,
            "foreign_keys": foreign_keys.get(name, []),
            "indexes": indexes.get(name, []),
        }
        if exact_counts:
            exact_owner_columns = [
                column
                for column in ownership
                if column in {"vendor_id", "tenant_id", "company_id", "outlet_id", "store_key"}
            ]
            if not exact_owner_columns:
                cur.execute(sql.SQL("SELECT count(*) FROM {}.{}").format(sql.Identifier(schema), sql.Identifier(name)))
                row["exact_rows"] = int(cur.fetchone()[0])
            for owner_column in exact_owner_columns:
                cur.execute(
                    sql.SQL("SELECT {}::text, count(*) FROM {}.{} GROUP BY 1 ORDER BY 1").format(
                        sql.Identifier(owner_column), sql.Identifier(schema), sql.Identifier(name)
                    )
                )
                row[f"rows_by_{owner_column}"] = [
                    {"id": owner_id, "rows": int(count)} for owner_id, count in cur.fetchall()
                ]
            if exact_owner_columns:
                row["exact_rows"] = sum(item["rows"] for item in row[f"rows_by_{exact_owner_columns[0]}"])
            if group_by:
                table_column_names = {column["name"] for column in table_columns}
                missing_group_columns = set(group_by) - table_column_names
                if missing_group_columns:
                    raise SystemExit(
                        f"group column(s) missing from {name}: " + ", ".join(sorted(missing_group_columns))
                    )
                group_select = sql.SQL(", ").join(sql.Identifier(column) for column in group_by)
                cur.execute(
                    sql.SQL("SELECT {}, count(*) FROM {}.{} GROUP BY {} ORDER BY {}").format(
                        group_select,
                        sql.Identifier(schema),
                        sql.Identifier(name),
                        group_select,
                        group_select,
                    )
                )
                row["rows_by_group"] = [
                    {"keys": dict(zip(group_by, values[:-1])), "rows": int(values[-1])}
                    for values in cur.fetchall()
                ]
        output.append(row)
    return output


def tenant_catalog(cur, schema: str) -> dict:
    cur.execute("SELECT to_regclass(%s)", (f'"{schema}".vendor',))
    vendor_exists = cur.fetchone()[0] is not None
    result: dict = {"vendors": [], "shopfront_store_mappings": [], "routes": []}
    if vendor_exists:
        cur.execute(
            sql.SQL(
                """
                SELECT v.id, v.status, v.subdomain, v.dummy_data_requested,
                       v.sample_data_cleared_at, v.outlet_id,
                       COALESCE(array_agg(DISTINCT o.id ORDER BY o.id)
                         FILTER (WHERE o.id IS NOT NULL), ARRAY[]::bigint[]) AS outlet_ids
                  FROM {}.vendor v
                  LEFT JOIN {}.outlet o ON o.vendor_id = v.id
                 GROUP BY v.id, v.status, v.subdomain, v.dummy_data_requested,
                          v.sample_data_cleared_at, v.outlet_id
                 ORDER BY v.id
                """
            ).format(sql.Identifier(schema), sql.Identifier(schema))
        )
        result["vendors"] = [
            {
                "vendor_id": int(row[0]),
                "status": row[1],
                "subdomain": row[2],
                "dummy_data_requested": bool(row[3]),
                "sample_data_cleared_at": row[4].isoformat() if row[4] else None,
                "legacy_outlet_id": int(row[5]) if row[5] is not None else None,
                "outlet_ids": [int(value) for value in row[6]],
            }
            for row in cur.fetchall()
        ]

    cur.execute("SELECT to_regclass(%s)", (f'"{schema}".shopfront_store_mapping',))
    if cur.fetchone()[0] is not None:
        cur.execute(
            sql.SQL(
                "SELECT store_key, company_id, outlet_id, enabled, shopfront_outlet "
                "FROM {}.shopfront_store_mapping ORDER BY store_key"
            ).format(sql.Identifier(schema))
        )
        result["shopfront_store_mappings"] = [
            {
                "store_key": row[0],
                "company_id": row[1],
                "outlet_id": row[2],
                "enabled": row[3],
                "shopfront_outlet": row[4],
            }
            for row in cur.fetchall()
        ]

    cur.execute("SELECT to_regclass(%s)", (f'"{schema}".tenant_shard_registry',))
    if cur.fetchone()[0] is not None:
        cur.execute(
            sql.SQL("SELECT vendor_id, shard_key, updated_at FROM {}.tenant_shard_registry ORDER BY vendor_id").format(
                sql.Identifier(schema)
            )
        )
        result["routes"] = [
            {"vendor_id": int(row[0]), "shard_key": row[1], "updated_at": row[2].isoformat()}
            for row in cur.fetchall()
        ]
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url-env", default="POSTGRESQL_URL", help="environment variable holding the PostgreSQL DSN")
    parser.add_argument("--schema", default="public")
    parser.add_argument("--exact-counts", action="store_true", help="run exact counts and tenant-key groupings; can scan large tables")
    parser.add_argument("--tables", help="comma-separated relation names to report; combines with --exact-counts for targeted scans")
    parser.add_argument("--group-by", help="comma-separated extra grouping columns for selected tables")
    parser.add_argument("--output", type=Path, default=ROOT / ".local" / "tenant-data-inventory.json")
    args = parser.parse_args()

    try:
        conn = connect_readonly(resolve_dsn(args))
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
            selected_tables = {name.strip() for name in args.tables.split(",") if name.strip()} if args.tables else None
            group_by = [name.strip() for name in args.group_by.split(",") if name.strip()] if args.group_by else []
            if group_by and not args.exact_counts:
                raise SystemExit("--group-by requires --exact-counts")
            tables = relation_inventory(cur, args.schema, args.exact_counts, selected_tables, group_by)
            tenant_data = tenant_catalog(cur, args.schema)
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
        "tenant_catalog": tenant_data,
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
