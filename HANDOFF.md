# Handoff — Orithos Native Ledger Cutover

> Generated: 2026-11-12 (UTC+8)
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`, branch `main`)  
> Session: Post-deploy Demo/SKR parity check + promote `business_date` fix + leftover UI cleanup  
> Related Chinese notes: `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md`  
> Tip SHA: see `git log -1` after this iterate push

## Goal

Orithos is the **live retail ledger** for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87). Shopfront remains the external SoT; crawler syncs into both tenants. Browser pages read **pos-api only**. Odoo stays non-writable (no dual-write).

## Current live database reconciliation (2026-11-12)

- POS runtime is up on the new PostgreSQL host, SHA `8ff23f0576ac3e0d4de82a3fad268ca4e29f077c`. Crawler runtime is running with `DATABASE_URL` on that same POS ledger; its separate `CRAWL_DATABASE_URL` remains on port `5679`.
- Restored 66 old-only Demo sale identities for Adelaide 2026-11-06 from the new DB's Shopfront mirror via `sales:upsert`. The old/new key diff is now zero old-only keys (old 2,372; new 2,400); 28 identities created after cutover remain. The restored group matches old and mirror totals/status/date: `$1,370.41`, 113 items, 93 payments, zero unmatched items.
- The live `sale` and `sale_item` sequences were advanced to their table maxima after auditing 125 owned sequences. Final checks show aligned sequence values and zero orphan sale-item/payment rows.
- Read-only native/mirror parity for 2026-11-06 is 189 identities / 183 completed / `$5,847.19` on each outlet, with zero missing identities or amount mismatches. Four Demo and five SKR records remain `VOIDED` in native rows and `PARKED` in mirror rows. Native updates are newer than mirror sync; preserve pending read-only Shopfront/action-history confirmation.
- Latest bounded repair check (2026-11-12): 264 selected identities (Demo 263, SKR 1) exist in both native and mirror layers; header amount/date fields, mapped item multisets, and normalized payment multisets match (550 item rows, 321 payment rows). No unmatched native items, duplicate native/mirror sale identities, orphan sale items/payments, or sequence lag. This is not a full-history promotion check.
- Full-scope follow-up is required before declaring complete historical parity: `shopfront_sale` has 157,059 rows per store vs native `sale` counts of 1,089 Demo and 1,399 SKR; natural-key join shows 311,631 mirror-only identities and one native-only identity. This is a cross-layer scope difference, not proof by itself of cutover loss. Full-scope status differences are 30 total (per store 5 native `VOIDED` vs mirror `CANCELLED`, 10 `VOIDED` vs `PARKED`). Compare intended native history against the retired-host snapshot and read-only Shopfront action history before any bulk promotion/status update.
- No code was deployed for this reconciliation. Runtime SHA above is the already-running deployment.

## Owner direction: complete Odoo retirement (2026-11-10)

The owner has confirmed that Orithos/Shopfront-synced data is sufficient and Odoo history will not be migrated. This supersedes the earlier recommendation to retain Odoo read-only: remove every Odoo runtime dependency, fallback, browser/BFF route, scheduled read, and environment requirement after its Orithos replacement preserves the workflow. Do not decommission the external host until the no-Odoo-config/network-block acceptance passes.

Status after Odoo/Shopfront browser-caller retirement (confirm `/api/public/version` after Dokploy):

- Live `pos-ui` components/app pages no longer call `/api/odoo/*` or `/api/shopfront*` for data (grep gate on `src/components` + `odoo-api.ts` clean). Workspace panels, settings company/tax/registers/export, PO list/confirm/receive, invoice→PO, price suggestions/bulk edit, daily sales history, assistant ops preview, and sync stamp all use Orithos APIs.
- Dead unmounted report/Shopfront page components removed. `/api/shopfront-source` remains 410.
- **BFF retirement:** deleted concrete `pos-ui/app/api/odoo/**` route handlers; left `app/api/odoo/[...path]/route.ts` returning **410**. Sales History nav → `/history` (redirects to reports ledger). `odoo-read-cache` no longer TTLs `/api/odoo/*`.
- **Post-deploy verify (2026-11-11, live SHA `1e06a9c0` / Dokploy Done for `01d413de` clone fix):** Shopfront day-totals **sf_match=True** for Adelaide **2026-11-08..10** (demo/skr shopfront revenue identical). Native revenue gap on Nov-10 is local `other_sales` only (demo 2×$4.80 vs skr 1×$4.80). `product-mappings:clone` skr→demo **CLONED** (mapped 3204→10996; 37 products still unmapped / ~3023 historical sales_unmatched). Crawler job **206** still `running/pos_import` at check time (soft secondary sales validate is in sibling crawler repo).
- **Iterate fix (this push):** mirror `shopfront_sale.business_date` + index; day-scoped `promote-native` uses it (UUID+created_at CASE previously full-scanned → gateway **502**). Clone also maps via source-store shopfront barcodes. match-status adds `products_unmapped`.
- **UI cleanup:** `/customers/odoo` redirects to `/customers`; removed unused `report-client` / `report-request` / `OdooPosConnectionCard`; trimmed legacy `*/odoo` from middleware/next.config no-store lists; deleted orphan BFF libs (`odoo-scope`/`odoo-categories`/`odoo-pricing`/`customer-access`/`scoped-read-cache`/`report-write-invalidation`) and dead `OdooSalesHistoryPage`; refreshed report-cache + odoo-api-retry tests.
- **Still open:** finish crawler job 206 + re-clone remaining 37; rematch/promote unmatched Demo sale lines; member pricelist / promotions / gift tenders; Demo cash open→sell→close write UAT; compose `report-worker` Odoo credentials; physical Odoo decommission; triage day-totals `other_sales` INV orphans.
- Cashiers on NativePosGate vendors `1,55` can list `/api/retail/payment-methods` without `settings.view`.

## Purchase ops vs report (2026-11-12)

- Shopfront splits **Orders** (workflow) and **Purchase Report** (aggregates). Orithos keeps the same split:
  - `/purchases` = `PurchasingWorkspace` ops shell (orders / invoice scans / suppliers / replenishment).
  - `/reports/purchase` = `NativePurchaseReportPage` → `GET /api/reports/purchase` on the native ledger.
- Report inclusion: `type=ORDER` and `status IN (RECEIVED, PARTIALLY_RECEIVED)` by `order_date` (Australia/Adelaide civil dates). Fees / freight / payment fees / tax stay `—` until line fields are stored; do not invent Shopfront report columns.
- Sync diagnostics on the report response: mirror vs mapped (`purchase_order_id > 0`) vs native counts. Mirror ≫ mapped is expected until product/supplier mapping catch-up; that gap is why list/report totals will not match Shopfront `/reports/purchase` 1:1.
- Ops list honesty: Shopfront-promoted rows show a hint when header `total_cost` diverges from sum of imported lines.

## Page audit (this follow-up)

| Page | Live finding before `7043eaf0` | Fix |
|------|--------------------------------|-----|
| `/dashboard` Store Pulse | Stuck on “Shopfront reports unavailable” (old `/api/shopfront-source`) | `useOverview` → `GET /api/reports/native-overview`; pulse shows Orithos sales/margin/inventory |
| `/reports/dashboard` | Already OK (`$5,035.80` / 161 yesterday) | Inventory metric now from `product_inventory` |
| `/history` + Sales History modal | `native-sales-history` HTTP 500 | Adelaide business-day SQL + safe date mapping |
| `/customers` | Odoo session gate; native `/api/customers` empty (1 row total) | UI routes to Orithos auth + `/api/customers`; SKR/Demo promote has rows |
| `/customers/[id]/view` | Odoo workspace + Shopfront history tabs | Native `/api/customers/{id}` + recent-sales + revisions |
| `/products` (owner-locked shell) | Odoo BFF records + Shopfront sections → 410 | `searchOdooRecords` → `/api/products` etc.; Orithos summary sections; create/update via `/api/products` |
| `/purchases` | Shopfront purchasing archive 403/410 | Removed `ShopfrontPurchasingSection`; Orithos `/api/orders` + `/api/suppliers` |
| `/reports/purchase` | Redirected to `/purchases` (no aggregate) | `NativePurchaseReportPage` + native purchase aggregate API |
| `/api/price-lists` | Classic filter 410 | Allowlisted + outlet-scoped controller |
| Product writes Classic gate | POST `/api/products` → 410 | `OdooOnlyModeFilter` allows full product routes |

## Completed this session

### Phase 1 — Native sales ledger
- Schema: `sale.source_system` + `sale.external_id` (unique with outlet).
- `ShopfrontNativeSaleImporter`: upsert Shopfront payloads into `sale` / `sale_item` / payments; **no historical stock moves**.
- Continuous path: crawler `sales:upsert` → mirror **and** native writer.
- Backfill: `POST /api/integrations/shopfront/sales:promote-native` (batched: `store_key`, `business_day`, `after_external_id`, `limit`).
- Adelaide day filter: offset/Z → Adelaide; naive timestamps treated as Adelaide local.
- Money: prefer payload `total_price` / `totalPrice`; avoid float drift on promote.

### Phase 2 — Reports / UI on pos-api (partial)
- `/dashboard` and `/history` use native overview / sales history (`source=orithos_ledger`). `/reports/dashboard` and `/reports/sales` still have Odoo/Shopfront BFF reads as recorded above.
- Overview Store Pulse → `GET /api/reports/native-overview` only.
- AppShell Sales History modal → `NativeSalesHistoryModal` (no Odoo overlay) — commit `42336225`.
- `/api/shopfront-source` → HTTP **410**.

### Phase 3 — Domain cutover (partial ship)
- Sell / register / close / customers / suppliers / inventory report / catalogue **reads** moved toward Orithos (owner-locked shells kept; data adapters under `odoo-api.searchOdooRecords`).
- Live probe (SKR+Demo): native-overview / products / customers / suppliers / orders / sales **200**; `/api/shopfront-source` **410**; `/api/odoo/purchase-orders` **403** (expected retired).
- **Not fully cleared:** transfers/replenishment Odoo RFQ, customer balances/gift cards still Odoo BFF reads, `/sell` classic Odoo register, some settings/AI Odoo reads. See “Next plan” below.

### Phase 4 — Verify / parity / deploy
- Java 21 `mvn -B verify` green (601 tests) on promote/day-totals work.
- Live Adelaide **2026-11-09** (SKR + Demo, after void orphans):

| Metric | Value |
|--------|--------|
| Native shopfront COMPLETED | **$5,035.80 / 161** |
| Mirror / crawler sale headers | **$5,035.80 / 161** |
| `sales:native-day-diff` mismatches | **0** |
| Shopfront sales-report DSL | **$5,038.48 / 162** |
| Report gap explanation | +1 **INCOMPLETE** invoice `00081327` / **$2.68** (native = PARKED) |
| `shopfront_report_comparable_*` | **$5,038.48 / 162** |
| Auth overview (cookie login) | `source=orithos_ledger`, revenue **5035.8 / 161** both stores |

- Cleanup: `POST .../sales:void-orphan-ref-refunds` voided UAT `REF-%` rows (demo −$4.50, skr −$4.80).
- Pushed to `origin/main`; Dokploy auto-deploys. Tip at handoff write time: see `git log -1` (includes later customer/shell fixes after cutover commits).

### Integration helpers (token = `X-Shopfront-Integration-Token`)
| Endpoint | Purpose |
|----------|---------|
| `GET .../sales:native-day-totals?day=YYYY-MM-DD` | Outlet COMPLETED vs shopfront / incomplete / report-comparable |
| `GET .../sales:native-day-diff?day=&store_key=` | Per-external_id parity |
| `POST .../sales:promote-native` | Batched mirror → native |
| `POST .../sales:void-orphan-ref-refunds` | Void `REF-%` + `source_system IS NULL` |

Local probes (ignored): `.local/probe-day-totals-mirror.cjs`, `probe-day-diff.cjs`, `promote-native-sales-timeout.cjs`, `void-orphan-refs.cjs`, `probe-overview-cookies.cjs`.

## Ops map (secret **names** only)

| Surface | URL | Auth |
|---------|-----|------|
| Shopfront (read-only; **never Register**) | `https://skr.onshopfront.com/` | AIWEI / owner password; Misc `/reports/misc` |
| SKR | `https://skr.orithos.com.au/` | `ORITHOS_SKR_USER` / `ORITHOS_SKR_PASS` |
| Demo | `https://demo.orithos.com.au/` | `admin` / `INITIAL_ADMIN_PASSWORD` |
| App | `https://app.orithos.com.au/` | `admin` / `INITIAL_ADMIN_PASSWORD` |
| Odoo (retired writable SoT) | `https://odoo.orithos.com.au/` | `ODOO_USER` / `ODOO_PASS` |
| Crawler | `https://crawler.orithos.com.au/` | `SHOPFRONT_INTEGRATION_TOKEN` |
| Dokploy | `https://dokploy.orithos.com.au/` | `ORTHOS_DOKPLOY_USER` / `ORTHOS_DOKPLOY_PASS` |
| DB (live POS ledger) | host `45.63.26.89:5432` | `POSTGRESQL_URL` (cutover 2026-11-12; retired `45.90.109.111:5888`) |
| Crawler → ledger | same live POS host | crawler `DATABASE_URL` must match live POS |
| Crawler DB | `45.63.26.89:5679` | `CRAWL_DATABASE_URL` |

Local repos (all `main`): POS `orithopos-master`, `shopfront-crawler`, `orithos-ai-services`, `orithos_odoo`, `shipany-template-dev`.  
Compose: POS `V3BuMZuSCowVe-OKWIR6J`; crawler `JHfNJMWCJGqpq0_5aovzZ`.

## Still true from prior cutover
- SKR=Demo staging parity; crawler `POS_API_SECONDARY_STORE_KEY=demo`; shared DB `postgres` / `isolated=false` / `APP_NATIVE_POS_ALLOW_SHARED_DATABASE=true`.
- Odoo business writes off.
- Inventory-at-date OAuth still 405 — staff Misc path.
- Xero = CSV scripts; formal pilot may remain NO-GO until backup/Xero/Odoo-retire bars clear.
- Owner: no local app builds; Java 21 gate before any `pos-api/` push.

## Working tree caution (at handoff)
Uncommitted local edits may exist under `pos-ui/app/reports/*`, `suppliers`, `NativeSupplierDirectoryPage` — **do not** mix into unrelated pushes without review. Untracked `.local-*.bundle` / `scripts/pg_restore_rehearsal.py` stay local.

---

## Remaining retirement work (owner-directed)

### P0 — Keep ledger green
1. After each Dokploy deploy: confirm `/api/public/version` SHA; re-run day-totals for yesterday Adelaide **on both Demo and SKR**.
2. Watch crawler scheduled syncs (`02:30` / `23:00` Adelaide); SKR and Demo must move together.
3. Never re-enable Odoo writes (`node .local/read-cutover-config.cjs`).
4. Keep `SHOPFRONT_STAFF_*` in crawler Compose for inventory Misc.
5. **Demo/SKR dashboard parity (2026-11-10):** Store pulse is per-outlet Orithos ledger. Demo lagged because (a) Demo `shopfront_product_mapping` was ~3168 vs SKR 11033, and (b) crawler dual-write sales failed when secondary unmatched/skipped lines were treated as hard errors (job 205 `pos_sales:0/207`). Fix: crawler soft-validates secondary sales; pos-api adds `POST .../product-mappings:clone` + barcode mapping persistence on sale upsert. After deploy, clone mappings then confirm `sales:native-day-totals` Demo≈SKR for yesterday.

### P1 — Finish Odoo / Shopfront UI retirement (by domain)
Done: live UI callers cleared (workspace, settings, PO/invoice, price tools, daily sales, assistant preview, sync stamp); dead report/Shopfront page components deleted; `odoo-api.ts` no longer fetches `/api/odoo/*`.

Still open:

1. **Checkout parity** — member price / promotions / gift tenders after cash happy path.
2. **Compose `report-worker`** — still requires `ODOO_*` env; retire or stub once native report snapshots own the schedule.
3. **Write UAT** — Demo cash open→sell→close (owner OK required for prod writes).

### P1 — Data / sync quality
8. Triage unmatched barcodes / products (do **not** invent GST/prices).
9. Optional: promote full historical `shopfront_sale*` beyond verified days (batched; monitor 502 → smaller `limit`).
10. Consider surfacing `shopfront_report_comparable_*` on dashboard when comparing to Shopfront Sales report UI.

### P2 — Pilot bars
11. Backup / restore drill (owner previously waived).
12. Xero day CSV acceptance / later live API.
13. Dedicated PG DB name (drop shared-`postgres` allow flag) when owner schedules window.
14. Physical Odoo decommission only after domain cutovers + acceptance evidence.

### Agent-sized slices

| Agent | Task | Forbidden |
|-------|------|-----------|
| Ops | Scheduled sync + day-totals smoke SKR/Demo | Fresh Volumes; Odoo writes |
| Products | Orithos catalogue read/write replacing `/api/odoo/records` products | Invent prices/GST |
| Purchasing | Transfers/replenishment → Orithos APIs | Dual-write Odoo |
| UAT | Browser: dashboard `orithos_ledger`; network tab no shopfront-source / odoo report RPCs | Production sell/refund without OK |

---

## Key constraints
- Demo credentials / Shopfront AIWEI password: env or owner chat only — never Git/handoff values.
- `shopfront_outlet` UUID must stay `11eeaa99e8d9de7a92c00261eda38a85`.
- `/docs/` largely gitignored — UAT JSON may be local-only.
- Reporting design/progress: `docs/project/features/reporting/{design,progress}.md`.

## Memory search hints
- `ShopfrontNativeSaleImporter promote-native native-day-totals`
- `INCOMPLETE 00081327 5038.48 5035.80`
- `void-orphan-ref-refunds REF-`
- `NativeSalesHistoryModal SalesHistoryUiProvider`
- `POS_API_SECONDARY_STORE_KEY demo`
