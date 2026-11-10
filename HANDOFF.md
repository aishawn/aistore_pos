# Handoff

> Generated: 2026-11-10 ~15:27 (UTC+8)  
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`)  
> Session summary: Demo+SKR Orithos-only cutover closed against eight deliverables; Shopfront is recurring SoT into both stores.  
> Canonical Chinese cutover notes: `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md`

## Goal

Keep Orithos as the **live retail ledger** for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87). Shopfront remains the recurring external SoT synced into both tenants. Odoo must stay **non-writable** (no dual-write). Do not use Shopfront register scrape.

## Current State

**Working (verified 2026-11-10):**
- Staging parity SKR = Demo: products `11033`, inventory `10852`, sales `156588`, sale_items `306934`, suppliers `109`, PO `2370`.
- Native sell/receive both tenants (API UAT): SKR sale `12` / order `2`; Demo sale `14` (`INV-1794280936903`) / order `3`.
- Dokploy live: `ODOO_BUSINESS_WRITE_ENABLED=false`, `ODOO_IMPORT_ENABLED=false`, `ODOO_STOCKTAKE_WRITE_ENABLED=false`; crawler ledger `skr:orithos`; `POS_API_SECONDARY_STORE_KEY=demo`; `POS_API_BASE_URL=http://backend:8080`.
- Inventory store-pulse: `shopfront_reporting_api` / `fresh` via staff Misc Inventory At Date + Name→ID enrich (OAuth Special Report still POST **405**).
- Crawler staff Misc **auto re-login** on expired session: `shopfront-crawler` `22b33d9`, Dokploy deploy `p4FTQUwOS42ecuI4INgG3` done `2026-11-10T07:06:24Z`.
- Schedule: Adelaide `02:30,23:00`, interval 30m (`GET https://crawler.orithos.com.au/api/sync/schedule`).
- AIWEI page Network: `orders(type:ORDER)=2370` ≡ staging PO; suppliers `109`; products GraphQL `10855` = catalog current.
- Xero interim path recorded: `scripts/xero_day_csv_export.py` + `docs/xero_exports/*_2026-11-10*` (gitignored `/docs/`).
- Owner waived durable PG backup this round («不用备份»).
- Eight-deliverable audit: `docs/UAT_SKR_DEMO_ORITHOS_CUTOVER_GOAL_AUDIT_2026-11-10.json` → `goal_complete=true`.
- Repos: POS `origin/main` @ `709ac786` (handoff); crawler `origin/main` @ `22b33d9`.

**Known gaps (not blocking day-to-day Orithos):**
- OAuth `/api/v2/reports/inventory-at-date` still 405 — staff Misc is the operational path.
- Live Shopfront GraphQL `sales.totalCount≈14317` ≠ staging archive `156588` (crawler↔POS still aligned; do not treat as sync drift).
- `barcode_unmatched=62`; staging products `11033` includes historical beyond GraphQL current `10855`.
- Shared DB name `postgres` → `isolated=false` expected while `APP_NATIVE_POS_ALLOW_SHARED_DATABASE=true`.
- Odoo host still up for history/BFF remnants — writes off; not physically decommissioned.
- Xero is CSV import/review path, not live Xero API.
- Formal pilot GO docs (`PILOT_RELEASE_READINESS`) may still say NO-GO for older unrelated bars; this cutover objective is closed.

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
