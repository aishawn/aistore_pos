# Scale ops runbook (10 → 200 stores)

## Capacity planning (shared Odoo + Orithos)

| Component | 1 store (pilot) | ~200 stores (no full history import) |
|---|---|---|
| R2 source archives | ~0.25 GB | ~50–100 GB on Cloudflare |
| App-server R2 mirror | ≤2 GB (retain 2) | Only **active** prefixes via `R2_PREFIXES`; do not mirror all 200 |
| Odoo Postgres | few–tens GB | Plan **1–2 TB** SSD + RAM **32–64 GB** |
| Orithos MySQL | small | **200–500 GB** with headroom |
| App (Next + Spring) | shared VPS | 4–8 vCPU / 16–32 GB |

## R2 multi-prefix

- Convention: `shopfront/{subdomain}/` with `manifest.json` + `shopfront.sqlite3`.
- Primary pilot prefix remains `R2_PREFIX` (default `shopfront/`) at archive root.
- Extra active stores: set `R2_PREFIXES=shopfront/acme/,shopfront/other/` on the `r2-sync` worker.
- Worker writes extras under `/data/tenants/{slug}/` with their own `CURRENT` pointer.
- Vendor row stores `r2_prefix` when provisioned.

## Backups

1. Daily Postgres dump (Odoo) + MySQL dump (Orithos); retain ≥14 days.
2. Before Odoo minor upgrades: full dump + filestore tarball.
3. Quarterly restore drill to a scratch host.
4. R2 is already durable object storage; app mirrors are disposable.

## Upgrades

1. Prefer Odoo **minor** upgrades on a staging DB clone first.
2. Keep installed Odoo modules minimal (POS + stock + purchase + account as needed).
3. Orithos deploys via Dokploy from `main`; never Fresh Volumes for `shopfront-archive` or DB volumes.

## Isolation checks

1. Create trial store B → confirm `odoo_company_id` ≠ demo.
2. Confirm `/api/tenant/odoo-binding` returns company for Host B.
3. Confirm BFF writes use `force_company` and cannot see demo products.
4. Suspend B → login + refresh return unavailable (40200 / 40323).

## Alerts

- Odoo provision `failed` on vendor detail.
- R2 worker `state=error` for primary or any tenant archive.
- Disk >80% on Postgres host.
