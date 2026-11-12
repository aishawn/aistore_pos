"""Import Shopfront price lists 1:1 from crawler mirror into live Orithos POS.

Read-only Shopfront source is already mirrored in crawler Postgres
(shopfront_extended_records entity_type=price_lists). This posts those payloads
to /api/integrations/shopfront/price-lists:upsert for each mapped store, then
re-links native customers by price-list name when source assignments exist.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]


def env(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"missing {name}")


def ssh(client: paramiko.SSHClient, cmd: str, timeout: int = 240) -> str:
    print(f"\n### {cmd[:220]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip()[:4000])
    if err.strip():
        print("STDERR:", err[:800].rstrip())
    if code != 0:
        raise RuntimeError(f"remote failed ({code})")
    return out


def post_json(url: str, token: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Shopfront-Integration-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc


def main() -> None:
    token = env("SHOPFRONT_INTEGRATION_TOKEN")
    api_base = env("SHOPFRONT_POS_API_BASE_URL").rstrip("/")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect("45.63.26.89", username=env("SERVER_USER"), password=env("SERVER_PASS"), timeout=30)
    try:
        names = ssh(client, "docker ps --format '{{.Names}}'")
        pos = next(line.strip() for line in names.splitlines() if "orithos-postgresql-" in line)
        crawl = next(line.strip() for line in names.splitlines() if "shopfrontdata" in line)

        stores_raw = ssh(
            client,
            f"""docker exec {pos} psql -U postgres -d postgres -At -F '\t' -c "SELECT store_key, outlet_id::bigint FROM shopfront_store_mapping WHERE enabled=TRUE ORDER BY store_key" """,
        )
        stores = [line.split("\t") for line in stores_raw.splitlines() if "\t" in line]
        if not stores:
            raise RuntimeError("no enabled shopfront store mappings")

        # Prefer each store's own mirror; fall back to skr catalog for outlets
        # that share the same Shopfront source but have an empty extended mirror.
        for store_key, outlet_id in stores:
            mirror_store = store_key
            rows_raw = ssh(
                client,
                f"""docker exec {crawl} psql -U postgres -d postgres -At -c "SELECT COUNT(*) FROM shopfront_extended_records WHERE store_key='{store_key}' AND entity_type='price_lists'" """,
            ).strip()
            if rows_raw == "0":
                mirror_store = "skr"
                print(f"{store_key}: no local price_lists mirror; using skr catalog")
            payloads = ssh(
                client,
                f"""docker exec {crawl} psql -U postgres -d postgres -At -c "SELECT raw_payload::text FROM shopfront_extended_records WHERE store_key='{mirror_store}' AND entity_type='price_lists' ORDER BY COALESCE(raw_payload->>'name','')" """,
            )
            items = []
            for line in payloads.splitlines():
                if not line.strip():
                    continue
                source = json.loads(line)
                source_id = str(source.get("id") or "").strip()
                name = str(source.get("name") or "").strip()
                if not source_id or not name:
                    continue
                items.append({
                    "source_id": source_id,
                    "name": name,
                    "allow_higher_price": bool(source.get("allowHigherPrice") or False),
                    "allow_discounting_promotions": bool(source.get("allowDiscountingPromotions") or False),
                    "items": source.get("items") if isinstance(source.get("items"), list) else [],
                })
            print(f"{store_key}: importing {len(items)} price lists via API")
            for offset in range(0, len(items), 50):
                batch = items[offset:offset + 50]
                receipt = post_json(
                    f"{api_base}/api/integrations/shopfront/price-lists:upsert",
                    token,
                    {"store_key": store_key, "items": batch},
                )
                data = receipt.get("data", receipt)
                print(f"{store_key}: batch@{offset} -> {json.dumps({k: data.get(k) for k in ('created','updated','skipped','item_rows','unmatched_items','enabled')}, sort_keys=True)}")

            # Re-link customers from crawler customer mirror priceList names.
            assign_raw = ssh(
                client,
                f"""docker exec {crawl} psql -U postgres -d postgres -At -F '\t' -c "SELECT source_id, COALESCE(raw_payload->'priceList'->>'name','') FROM shopfront_customers WHERE store_key='{store_key}' AND COALESCE(deleted,false)=false AND COALESCE(raw_payload->'priceList'->>'name','')<>''" """,
            )
            assigns = [line.split("\t", 1) for line in assign_raw.splitlines() if "\t" in line]
            print(f"{store_key}: customers with Shopfront priceList={len(assigns)}")
            if assigns:
                values_sql = ",".join(
                    "('{0}','{1}')".format(sid.replace("'", "''"), name.replace("'", "''"))
                    for sid, name in assigns
                )
                ssh(
                    client,
                    f"""docker exec {pos} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \"
CREATE TEMP TABLE _sf_pl_assign(source_id text, price_list_name text);
INSERT INTO _sf_pl_assign(source_id, price_list_name) VALUES {values_sql};
UPDATE customer c
SET price_list_id = pl.id
FROM shopfront_customer_mapping m
JOIN _sf_pl_assign a ON a.source_id = m.source_id
JOIN price_list pl
  ON pl.outlet_id = m.outlet_id::bigint
 AND pl.active = TRUE
 AND LOWER(TRIM(pl.name)) = LOWER(TRIM(a.price_list_name))
WHERE m.store_key = '{store_key}'
  AND m.outlet_id::bigint = {outlet_id}
  AND c.id = m.customer_id
  AND c.outlet_id = {outlet_id}
  AND c.deleted_at IS NULL;
\" """,
                )

        ssh(
            client,
            f"""docker exec {pos} psql -U postgres -d postgres -c \"
SELECT m.store_key,
  (SELECT COUNT(*) FROM price_list pl WHERE pl.outlet_id=m.outlet_id::bigint AND pl.active=TRUE) AS price_lists,
  (SELECT COUNT(*) FROM price_list_item i JOIN price_list pl ON pl.id=i.price_list_id AND pl.outlet_id=m.outlet_id::bigint) AS items,
  (SELECT COUNT(*) FROM customer c WHERE c.outlet_id=m.outlet_id::bigint AND c.deleted_at IS NULL AND c.price_list_id IS NOT NULL) AS customers_with_pl
FROM shopfront_store_mapping m
WHERE m.enabled=TRUE
ORDER BY m.store_key;
\" """,
        )
        ssh(
            client,
            f"""docker exec {pos} psql -U postgres -d postgres -c \"
SELECT m.store_key, pl.name, COUNT(c.id) FILTER (WHERE c.deleted_at IS NULL) AS customers
FROM shopfront_store_mapping m
JOIN price_list pl ON pl.outlet_id=m.outlet_id::bigint AND pl.active=TRUE
LEFT JOIN customer c ON c.price_list_id=pl.id AND c.outlet_id=pl.outlet_id
WHERE m.enabled=TRUE
GROUP BY m.store_key, pl.name
ORDER BY m.store_key, pl.name;
\" """,
        )
    finally:
        client.close()


if __name__ == "__main__":
    main()
