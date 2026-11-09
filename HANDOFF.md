# Handoff

> Generated: 2026-11-10 (Australia/Adelaide business context; wall clock UTC+8)  
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`)  
> Session summary: Owner-authorized Odoo→Orithos native cutover for Demo+SKR on shared PostgreSQL; Shopfront POS writes are being checked for two-store completeness, source report parity, signed inventory and sales gaps.

## Shopfront Alignment Update (2026-11-10)

- POS `main` and the SKR/Demo runtime are currently at `db30205559b4d531435b5b9e7ea0e626910e558f`. The last recorded exact-SHA GitHub Java 21 `mvn -B clean verify` result is for `3ed7ffcd7e96ba666f6a17999aa0c3cb2ae1177d` (workflow run `42647599802`); current local changes are frontend and crawler report-refresh propagation.
- Crawler catalog job `#197` is still running. Latest read-only status at `2026-11-09T19:36:46Z`: `pos_inventory:skr:5000/10852`, heartbeat `19:36:46Z`. Its SyncRun is `#99`. Do not start another snapshot or deploy a POS restart until this durable job reaches a terminal state. Demo staging is still awaiting its mirror phase.
- Latest crawler coverage: `11,033` source-linked products; current catalog `10,855` (`10,852` ACTIVE, `3` NOT_ACTIVE), plus `178` products referenced by sales but not confirmed in the current catalog; complete inventory snapshot `10,852`; sales `156,588` / `306,934` lines. SKR product ID reconciliation passes exactly: crawler `11,033`, POS `11,033`, missing `0`, extra `0`. POS inventory was still being replaced (`2,000/10,852` at last check); Demo was `0` across mirrored domains before its phase. POS sales remain `156,424` / `306,614`, a difference of `164` sales / `320` lines. Reconcile sales after job `#197` terminates.
- Shopfront Inventory report's default positive-on-hand scope returns `3,056` rows, while the complete GraphQL snapshot contains `10,852` rows: `5,374` negative products are excluded from the default positive view and remain available in the signed snapshot. Example raw levels: case `-503`, item `-9`, case size `12`, derived units `-6,045`; crawler preserves the signed source value. Full-snapshot signed units are `-257,000`, positive sellable units are `50,278`, and the negative cost valuation is not a sellable-stock value.
- Shopfront Sales report for Adelaide business date `2026-11-09`: revenue `$5,038.48`, COGS `$3,620.12`, Profit `$1,418.36`, profit percentage `28.15%`; `Revenue - COGS` matches Profit exactly and GraphQL transaction reconciliation is `162/162` with zero revenue/COGS variance.
- Current Store Pulse code reads Shopfront source reports without first requiring `/api/odoo/reporting-dashboard`; if source reports fail, metrics show unavailable instead of silently retaining Odoo values. This session's local change makes explicit report refreshes reach Shopfront through the crawler and fails closed on stale fallback. It passes POS typecheck and crawler focused tests but is not committed or deployed yet.
- Browser page-by-page acceptance is still open; Windows browser automation could not establish the current URL with sufficient confidence. Inventory/Sales source API reconciliation is evidence of report data, not a substitute for visual acceptance of Shopfront and Orithos pages.

### Next Steps

1. Continue polling job `#197`; after it finishes, verify `skr` and `demo` staging product/inventory counts and quantity reconciliation. Record terminal run/job counts before triggering anything else.
2. Reconcile the `164` sale / `320` line gap using immutable Shopfront sale IDs. Prefer a bounded, idempotent repair or an explicit mirror-only reconciliation; verify source and both POS store keys afterward.
3. Complete a Shopfront-source UI and report audit by fixed Adelaide business dates. Confirm default Inventory is the positive-only `3,056` row view and negative inventory remains separately inspectable.
4. The explicit report-refresh propagation change is staged locally and passes crawler focused tests, POS typecheck and targeted lint; push and deploy it after the active catalog job completes, then verify runtime SHA and the three Store Pulse values on SKR and Demo.
5. Keep pilot production readiness **NO-GO** until backup restore, Xero and Odoo-retirement acceptance are documented.

## Goal

Make Orithos the live retail ledger for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87), with Shopfront sync writing Orithos (not Odoo business write), then retire Odoo as SoT after backup/Xero/acceptance. Owner authorized cutover on the existing shared DB named `postgres`.

## Current State

**Working:**
- Live POS Compose SHA: `db30205559b4d531435b5b9e7ea0e626910e558f`; both SKR and Demo public runtime endpoints match.
- Native write gate: `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1,55`, `APP_NATIVE_POS_EXPECTED_DATABASE=postgres`, `APP_NATIVE_POS_ALLOW_SHARED_DATABASE=true`, `RUNTIME_ENVIRONMENT=production`.
- Public attestation: `posDatabaseVerified=true`, `posSharedDatabaseAuthorized=true`, `posDatabaseStatus=SHARED_DATABASE_NAME`, `isolated=false` (expected on shared DB).
- SKR open → quote → checkout → idempotent replay → refund → close: **PASS** (`docs/test-sessions/2026-11-09-skr-native-checkout-loop.json`; login used `ORITHOS_SKR_USER`/`ORITHOS_SKR_PASS`, vendorId 55, register 114).
- Shopfront store mappings on POS: `skr→company 55 / outlet 87`, `demo→company 1 / outlet 1`.
- Crawler Dokploy env: `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos`, `POS_API_BASE_URL=https://api.orithos.com.au`, `POS_API_SECONDARY_STORE_KEY=demo`, `POS_API_MIRROR_BASE_URL=` (empty), `ODOO_IMPORT_ENABLED=false`.
- Crawler `main` `e59e050` joins external Docker network `orithos-pos-qeyai0_default`; the current Dokploy runtime uses the public POS API URL above because the prior container hostname was not resolvable from the crawler.

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
