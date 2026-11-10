# Handoff

> Generated: 2026-11-10 ~20:10 (UTC+8)  
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`)  
> Session summary: Native ledger cutover — Shopfront sales → `sale`/`sale_item`; reports/UI Orithos-only; Nov-9 row parity closed; report DSL gap = 1 INCOMPLETE.  
> Canonical Chinese cutover notes: `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md`

## Ops credentials (names only — values in local `.env` / Dokploy)

| Surface | URL | User / secret name |
|---------|-----|--------------------|
| Shopfront (read-only; never Register) | `https://skr.onshopfront.com/` | AIWEI / owner-provided; Misc reports `/reports/misc` |
| SKR store | `https://skr.orithos.com.au/` | `ORITHOS_SKR_USER` / `ORITHOS_SKR_PASS` |
| Demo store | `https://demo.orithos.com.au/` | `admin` / `INITIAL_ADMIN_PASSWORD` |
| Control plane | `https://app.orithos.com.au/` | `admin` / `INITIAL_ADMIN_PASSWORD` |
| Odoo (retired writable SoT) | `https://odoo.orithos.com.au/` | `ODOO_USER` / `ODOO_PASS` |
| Crawler | `https://crawler.orithos.com.au/` | `SHOPFRONT_INTEGRATION_TOKEN` |
| Dokploy | `https://dokploy.orithos.com.au/` | `ORTHOS_DOKPLOY_USER` / `ORTHOS_DOKPLOY_PASS` |
| DB | — | `POSTGRESQL_URL` |

Local repos: `orithopos-master` (POS), `shopfront-crawler`, `orithos-ai-services`, `orithos_odoo`, `shipany-template-dev` — all `main`.

## Goal

Keep Orithos as the **live retail ledger** for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87). Shopfront remains the recurring external SoT synced into both tenants. Browser pages read **pos-api only** (no crawler / `/api/shopfront-source` / Odoo report RPCs). Odoo must stay **non-writable** (no dual-write).

## Current State

**Shipped to `origin/main` (2026-11-10 native ledger cutover):**
- POS head `d6c0a187` (report-comparable totals + void orphan REF refunds); crawler `e142bd5`. Java 21 `mvn -B verify` PASS (601 tests).
- Schema: `sale.source_system` + `sale.external_id`; importer `ShopfrontNativeSaleImporter`; continuous `sales:upsert` writes native ledger; `sales:promote-native` backfills from mirror (no stock moves).
- UI: `/dashboard`, `/reports/dashboard`, `/reports/sales`, `/history`, Overview pulse → native report APIs; products/suppliers/inventory/sell → Orithos; Shopfront report routes redirect; `/api/shopfront-source` → 410.
- Adelaide `2026-11-09` **sale-row** parity (SKR+Demo): native shopfront COMPLETED = mirror = crawler headers = **`$5,035.80` / 161** (`sales:native-day-diff` zero mismatches). Shopfront sales-report DSL **`$5,038.48` / 162** = completed + one **INCOMPLETE** sale `00081327` / `$2.68` (open ticket; native status PARKED). `sales:native-day-totals` exposes `shopfront_report_comparable_*`. Void UAT `REF-%` orphans with `sales:void-orphan-ref-refunds` so outlet-wide overview matches shopfront completed.

**Still true from prior cutover:**
- Staging parity SKR = Demo mirror counts; Odoo business writes off; crawler `POS_API_SECONDARY_STORE_KEY=demo`; shared DB `postgres` / `isolated=false` expected.
- OAuth inventory-at-date still 405 — staff Misc path for inventory refresh.
- Xero remains CSV path; formal pilot GO may still be NO-GO for backup/Xero/Odoo-retire bars.

## Files in Play

| Path | Why |
|------|-----|
| `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md` | Chinese SoT cutover handoff (outside POS git root) |
| `docs/UAT_SKR_DEMO_ORITHOS_CUTOVER_GOAL_AUDIT_2026-11-10.json` | Eight-deliverable audit (gitignored under `/docs/`) |
| `docs/UAT_SKR_DEMO_ORITHOS_CUTOVER_API_2026-11-10.json` | Native sell/receive + flags evidence |
| `docs/UAT_SKR_SHOPFRONT_PAGE_NETWORK_SALES_PURCHASE_2026-11-10.json` | AIWEI Sales/Purchase Network parity |
| `scripts/xero_day_csv_export.py` | Owner Xero day CSV acceptance path |
| `shopfront-crawler` `app/shopfront.py` | Staff login + Misc inventory + session re-login |
| `pos-ui/app/api/shopfront-source/route.ts` | Demo/SKR host → crawler `store=skr` |
| `pos-ui/src/lib/shopfront-store-scope.ts` | `demo` subdomain maps source store to `skr` |
| `.local/read-cutover-config.cjs` | Dokploy env read (Odoo write flags) |
| `.local/read-crawler-deploy-sha.cjs` | Dokploy crawler deploy titles/SHA proxy |

## What Has Been Tried (and Why It Failed / Was Skipped)

1. **OAuth Special Report inventory-at-date** — POST 405 / GET 401 on this tenant; cannot be the sole inventory path.
2. **Bearer token on UI Misc `/reports/misc/inventory-at-date`** — 401; needs staff `laravelsession`.
3. **Browser `/api/v2/graphql` with cookies only** — 401; page uses session `POST /graphql` instead.
4. **Full `pg_dump` / S3 durable backup** — hung/failed on large shared DB; owner said skip («不用备份»).
5. **Crawler `store=demo` source-reports** — 404 `Unknown store`; Demo correctly uses Shopfront source key `skr`.
6. **Treating live GraphQL sales.totalCount as staging failure** — wrong口径; archive vs live connection.

## Current Best Theory

Operational SoT is Orithos + Shopfront sync. Keep Odoo writes false forever for these tenants unless a deliberate rollback. Inventory KPI durability depends on **staff credentials + auto re-login** until Shopfront fixes Special Report OAuth. Prefer OAuth GraphQL/Reporting for catalog/sales/PO; use staff only for Misc inventory-at-date.

## Next Steps (ordered)

### P0 — Stabilize operations (do first)

1. **Watch first Adelaide scheduled syncs after `22b33d9`**  
   - `GET /api/sync/schedule` and recent completed jobs (not only manual).  
   - After `02:30` / `23:00` Adelaide: confirm SKR=Demo snapshot still move together; inventory `refresh=true` still `shopfront_reporting_api`.
2. **Do not re-enable Odoo writes**  
   - Re-check with `node .local/read-cutover-config.cjs` after any Dokploy env edit.  
   - Never dual-write Orithos + Odoo.
3. **Staff credential hygiene**  
   - Keep `SHOPFRONT_STAFF_*` in crawler Compose whitelist (not Dokploy-only).  
   - If inventory refresh fails with staff login errors, rotate password in Dokploy + Compose and re-deploy crawler — do not scrape register.

### P1 — Owner / accountant

4. **Xero day pack when needed**  
   ```text
   python scripts/xero_day_csv_export.py --store skr --date YYYY-MM-DD
   python scripts/xero_day_csv_export.py --store demo --date YYYY-MM-DD
   ```  
   Review `docs/xero_exports/`. Optional later: first-class `/api/accounting/xero` (new feature, not required for cutover).
5. **Decide backup policy**  
   - Owner waived this round. If reversed: schedule restore drill on a non-prod target and record evidence (do not Fresh Volumes production).

### P1 — Multi-agent friendly follow-ons

| Agent | Scope | Concrete task | Forbidden |
|-------|--------|---------------|-----------|
| A Ops | read-only API/Dokploy | Log two scheduled job successes; mapping UUID still hex outlet | No code edits; no Fresh Volumes |
| B Crawler | `shopfront-crawler` | Optional: persist staff cookie TTL metrics; alert on repeated re-login | No POS UI; no register |
| C Xero | `scripts/xero_*` | Accountant-facing one-pager + sample day | No live Xero API unless owner asks |
| D UAT | browser SKR+Demo | Store Pulse inventory source chip; Dashboard day totals vs Reporting | Writes need explicit owner OK |
| E Retire | docs + POS inventory of Odoo BFF | List remaining Odoo read paths; propose removal order | Do not delete Odoo this sprint |

### P2 — Product / tech debt

6. **Dashboard same-day Reporting amount cross-check** (Adelaide business date) vs Shopfront Sales report.  
7. **62 unmatched barcodes** — triage; do not invent GST/prices.  
8. **Historical PO → native `purchase_order`** — design only if product needs Orithos PO history beyond staging.  
9. **Dedicated PG database name** (drop shared `postgres` allow flag) when owner schedules a migration window.  
10. **Shopfront support ticket** for Special Report POST 405 (non-blocking while staff Misc works).

## Key Constraints and Context

- Hosts: `skr.orithos.com.au`, `demo.orithos.com.au`, `crawler.orithos.com.au`, Shopfront `skr.onshopfront.com` (AIWEI only; **no register**).
- Compose ids: POS `V3BuMZuSCowVe-OKWIR6J`; crawler `JHfNJMWCJGqpq0_5aovzZ`.
- Secrets: Dokploy / local `.env` only — never commit. Names: `ORITHOS_SKR_USER`/`ORITHOS_SKR_PASS`, `SHOPFRONT_STAFF_*`, `SHOPFRONT_INTEGRATION_TOKEN`, `DEMO_ADMIN_PASSWORD` / `INITIAL_ADMIN_PASSWORD`.
- Owner preference: no local app builds; Java 21 gate before pushing `pos-api/` changes.
- `/docs/` is gitignored — UAT JSON may exist only locally; cite paths anyway.
- `shopfront_outlet` must be 32-hex UUID `11eeaa99e8d9de7a92c00261eda38a85`, never label `skr`/`demo`.

## Memory Pointers

- Search: `staff Misc inventory-at-date shopfront_reporting_api`
- Search: `POS_API_SECONDARY_STORE_KEY demo skr:orithos`
- Search: `orders type ORDER 2370 sales totalCount 14317`
- Audit file: `UAT_SKR_DEMO_ORITHOS_CUTOVER_GOAL_AUDIT_2026-11-10`

## Owner-Authorized Odoo Retirement (2026-11-10)

The owner authorized complete Odoo retirement and confirmed that existing Orithos/Shopfront data is sufficient; do not plan an Odoo history backfill. This does not mean the code or service is already retired.

Current source candidate moves `/dashboard`, `/reports/dashboard`, and `/reports/sales` to the Orithos native ledger through `GET /api/reports/native-overview`. It excludes Shopfront mirror history, requires `reports.dashboard`, scopes by authenticated outlet, and reports inventory/cost as unavailable when the native endpoint cannot verify those values. It is not built, deployed, or online-accepted. The former untracked Shopfront fetch helper was renamed/migrated to `pos-ui/src/lib/orithos-api-fetch.ts`; it has no remaining Shopfront URL behavior.

Remaining Odoo dependencies include other product, inventory, purchasing, customer, pricing, register/session and AI flows; Next `/api/odoo/*` BFF/session recovery and clients; Spring Odoo clients/provisioners/bindings and legacy schema; and Compose/Dokploy environment references. Migrate each user-visible function to an outlet-scoped Orithos API and reconcile its data/permissions before deleting its Odoo path. Preserve `APP_ODOO_ONLY_MODE`'s legacy POS API write protection until an equivalent guard is in place. Do not shut down Odoo, remove its network/configuration, push Java changes, or claim zero runtime dependency until the exact candidate passes Java 21 `mvn -B clean verify`, starts with no Odoo settings/network access, and passes SKR/Demo acceptance. Owner preference remains no local application build; no production business writes.
