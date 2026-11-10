# Handoff

> Generated: 2026-11-10 ~14:50 (UTC+8)  
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`)  
> Canonical cutover notes: `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md`

## Shopfront Alignment Update (2026-11-10 14:50)

- **Operational cutover SKR+Demo: PASS** (staging mirror, Odoo writes off, native sell/receive both tenants). Shared DB `postgres` + `APP_NATIVE_POS_ALLOW_SHARED_DATABASE=true` remains expected (`isolated=false`).
- Staging parity (SKR=Demo): products `11033`, inventory `10852`, sales `156588`, sale_items `306934`, suppliers `109`, PO `2370`.
- Inventory store-pulse: OAuth Special Report still POST **405**; **staff Misc Inventory At Date + Name→ID enrich** path live → `source-reports/inventory?refresh=true` = `shopfront_reporting_api` / `fresh` (crawler `4faf745`). Unforced reads may still serve GraphQL snapshot cache.
- Schedule: Adelaide `02:30,23:00`, interval 30m (`GET /api/sync/schedule`).
- **Page Network Sales/Purchase (AIWEI):** session `POST /graphql` (not `/api/v2`). Purchase `orders(type:ORDER)=2370` ≡ staging PO. Suppliers `109`. Products GraphQL `10855` = catalog current (staging `11033` includes historical). Sales: crawler↔POS `156588` aligned; live GraphQL `sales.totalCount≈14317` is a **UI connection totalCount vs historical archive** gap, not crawler/POS drift. Evidence: `docs/UAT_SKR_SHOPFRONT_PAGE_NETWORK_SALES_PURCHASE_2026-11-10.json` (gitignored `/docs/`).
- Owner **「不用备份」** — durable PG/S3 backup out of this round. Xero interim: `scripts/xero_day_csv_export.py` + `docs/xero_exports/*_2026-11-10*`. Pilot formal production still **NO-GO** until owner/accountant Xero acceptance (backup skipped per owner).
- Crawler staff Misc **auto re-login** on `22b33d9` — Dokploy deploy `p4FTQUwOS42ecuI4INgG3` done `2026-11-10T07:06:24Z`.
- Requirement audit: `docs/UAT_SKR_DEMO_ORITHOS_CUTOVER_GOAL_AUDIT_2026-11-10.json` (`goal_complete=false`; blocker = Xero owner acceptance).

### Next Steps

1. Owner/accountant accept (or waive) Xero day CSV path.
2. Keep Odoo business/import/stocktake writes false; do not register-scrape Shopfront.
3. Optional: Dashboard same-day Reporting amount cross-check; physical Odoo read-only retire later.

## Goal

Make Orithos the live retail ledger for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87), with Shopfront sync writing Orithos (not Odoo business write), then retire Odoo as SoT after backup/Xero/acceptance. Owner authorized cutover on the existing shared DB named `postgres`.

## Current State

**Working:**
- Live POS Compose SHA: `db30205559b4d531435b5b9e7ea0e626910e558f`; both SKR and Demo public runtime endpoints match.
- Native write gate: `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1,55`, `APP_NATIVE_POS_EXPECTED_DATABASE=postgres`, `APP_NATIVE_POS_ALLOW_SHARED_DATABASE=true`, `RUNTIME_ENVIRONMENT=production`.
- Public attestation: `posDatabaseVerified=true`, `posSharedDatabaseAuthorized=true`, `posDatabaseStatus=SHARED_DATABASE_NAME`, `isolated=false` (expected on shared DB).
- SKR open → quote → checkout → idempotent replay → refund → close: **PASS** (`docs/test-sessions/2026-11-09-skr-native-checkout-loop.json`; login used `ORITHOS_SKR_USER`/`ORITHOS_SKR_PASS`, vendorId 55, register 114).
- Shopfront store mappings on POS: `skr→company 55 / outlet 87`, `demo→company 1 / outlet 1`.
- Crawler Dokploy env: `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos`, `POS_API_BASE_URL=http://backend:8080`, `POS_API_SECONDARY_STORE_KEY=demo`, `POS_API_MIRROR_BASE_URL=` (empty), `ODOO_IMPORT_ENABLED=false`.
- Crawler joins external Docker network `orithos-pos-qeyai0_default` so `backend:8080` resolves (POS backend is only on that project network, not `dokploy-network`). Do not switch back to public `api.orithos.com.au` for large catalog imports (Cloudflare 502/524).

**Broken / incomplete:**
- Pilot remains **NO-GO for formal production** until backup/Xero/Odoo-retire acceptance (owner’s earlier readiness bar).
- SKR **PO receive** UAT not re-run in this cutover session (sell-loop only).
- Dual-outlet catalogue/inventory parity still open: job `#197` is syncing the catalog; latest phase is `skr:5000/10852` inventory. Product IDs match on SKR; Demo is waiting for its mirror phase. Earlier jobs `#193`/`#194` were cancelled before completion.
- Shared DB name `postgres` will never attest `isolated=true`; long-term should move to a dedicated DB name.
- Local `.gitignore` contains `/docs/`, so dated evidence under `docs/test-sessions/` may stay untracked unless force-added.

## Files in Play

| File | Why it matters |
|------|----------------|
| `pos-api/.../NativePosGate.java` | Write gate; shared-DB allow flag |
| `pos-api/.../PosDatabaseIdentity.java` | `matchesAuthorizedDatabase` / shared-name rules |
| `pos-api/.../BuildIdentityController.java` | `posSharedDatabaseAuthorized` attestation |
| `pos-api/.../ShopfrontIntegrationController.java` | Mapping PUT boolean `enabled` fix for PostgreSQL |
| `pos-ui/src/lib/auth.tsx` | Fixed FocusEvent listener typing that blocked Dokploy frontend build |
| `docker-compose.yml`, `application.yml`, `.env*.example`, `DEPLOYMENT.md` | Env wiring for allow-shared |
| `shopfront-crawler` repo `app/config.py`, `app/main.py` | `POS_API_SECONDARY_STORE_KEY` dual catalogue write |
| `.local/enable-native-pos-cutover.cjs` | Dokploy POS env cutover |
| `.local/enable-dual-outlet-secondary.cjs` | Mapping + crawler secondary env |
| `.local/skr-checkout-with-dokploy-pass.cjs` | SKR E2E runner |

## What Has Been Tried (and Why It Failed)

1. **Only adding vendor 55 without shared-DB allow** — `PosDatabaseIdentity` rejects `postgres`/`aipos`/`orithos`/`production`/`prod` even when names match; `databaseAuthorized()` stayed false.
2. **Dokploy deploys of `51b2b073` (cutover code alone)** — Frontend build failed: `pos-ui/src/lib/auth.tsx` TS2769 (`addEventListener("focus", refreshIfDue)` where `refreshIfDue` takes `force?: boolean`). Backend jar built; Compose aborted on frontend. Fixed in `b58b6ee6`.
3. **PUT `/api/integrations/shopfront/mappings/{store}` with `enabled=1`** — PostgreSQL boolean column rejects integer literal → HTTP 500. Fixed to bind `Boolean.TRUE` on Postgres.
4. **`POS_API_MIRROR_BASE_URL=https://demo...` with same store_key** — Shared DB + one mapping → double-write to the same outlet, not Demo outlet 1. Replaced by secondary store_key `demo`.
5. **Waiting on `isolated=true` for SKR UAT** — Impossible on authorized shared DB; SKR preflight must use `posDatabaseVerified` / `posSharedDatabaseAuthorized`.

## Current Best Theory

Authorized shared-DB cutover is the correct interim SoT for Demo+SKR. Catalogue/inventory stay dual-outlet via `skr` + `demo` mappings; sales ledger for SKR stays on outlet 87. Odoo should stay read-only / non-import until backup + Xero + owner retire checklist clear. Do not “fix” isolation by renaming attestation while still on DB `postgres`.

## Next Steps (ordered)

1. **Confirm crawler runtime** after `c00da84` deploy: container healthy; env shows `POS_API_SECONDARY_STORE_KEY=demo`; trigger `POST /api/stores/skr/pos/catalog-snapshot` (or daily job) and prove both outlets’ product/inventory counts move together (API counts on Demo outlet 1 vs SKR outlet 87).
2. **SKR PO receive UAT** on Orithos path (partial receive + idempotency), with write evidence file; reuse Demo PO patterns from earlier session scripts under `.local/demo-migration-po-uat.cjs` / `demo-po-receive-only.cjs` adapted to SKR host/credentials.
3. **Re-smoke Demo checkout** under the same shared allowlist (vendor 1) so both tenants stay green on `b58b6ee6+`.
4. **Backup attestation**: successful restore drill of current Orithos PG (not just dump existence); record SHA, restore target, constraint check.
5. **Xero path**: decide export/sync owner acceptance criteria; do not block sell-loop on Xero unless owner requires it for GO.
6. **Odoo retire plan**: domain-by-domain stop of Odoo writes for SKR/Demo after Orithos acceptance; keep Odoo read-only history as agreed; never dual-write.
7. **Optional hardening**: provision dedicated DB name (not `postgres`) and drop `APP_NATIVE_POS_ALLOW_SHARED_DATABASE` once migrated.
8. Update `docs/CAPABILITY_STATUS.md` / `docs/PILOT_RELEASE_READINESS.md` only with SHA-linked evidence; keep pilot **NO-GO** until steps 4–6 owner-accepted.

## Key Constraints and Context

- Owner authorized cutover and Dokploy env edits; prefer push to `main` for deploy.
- No local application builds preference; Java 21 `mvn -B clean verify` was run locally for gate commits before push (machine has JDK 21 at `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1`).
- Do not write production Odoo `aipos` for sell/receive UAT; current Odoo side remains `aipos_uat` / non-import.
- Secrets stay in Dokploy / local `.env` only — never commit passwords. SKR login secret names: `ORITHOS_SKR_USER`, `ORITHOS_SKR_PASS`.
- Crawler deploys from **separate** repo `aishawn/shopfront-crawler`, Compose id `JHfNJMWCJGqpq0_5aovzZ`. POS Compose id `V3BuMZuSCowVe-OKWIR6J`.
- Product/barcode uniqueness is **outlet-scoped** after earlier migration; Demo catalogue was cloned/seeded from SKR then kept via secondary store_key going forward.

## Memory Pointers

- Search: `NativePosGate allow shared database cutover vendor 55`
- Search: `POS_API_SECONDARY_STORE_KEY demo outlet`
- Prior status SoT files (may be gitignored locally): `docs/HANDOFF_2026-10-29_CURRENT.md`, `docs/CAPABILITY_STATUS.md`, `docs/PILOT_RELEASE_READINESS.md`
