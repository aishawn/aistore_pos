# Handoff — Orithos Native Ledger Cutover

## Current release status (2026-11-17)

- GitHub `main` includes stock-value query optimization at `6f339fbddb6998896665eb123f6aff906770bb6b`; Demo and SKR frontend/backend runtime SHAs match it. Selected critical AI workflow checks passed 10/10 per store, SKR read-only verifier passed 7/7, and Demo metrics UI/API passed 9/9. The workflow reports themselves are marked `BLOCKED` only because they intentionally ran 10 of 414 catalog cases; the summarizer reports 20 PASS, 0 FAIL, 0 blocked cases.
- The exact-SHA Java 21 candidate workflow is optional, not a pre-push gate. Push task-scoped changes directly to `main`, then confirm both deployed runtime SHAs and run scoped online acceptance. Older release-blocker notes below are historical records and do not override this current policy.
- Stock value is honestly reported unavailable in both stores because no on-hand products have verifiable positive costs. Demo reports 3,071 unvalued products and SKR 3,050; numeric inventory-value parity cannot be established until verified costs exist. The post-deploy latency sample is exploratory and does not prove an improvement.
- Evidence is under the ignored `.local/ai-eval/` folder in the `ai-assistant-uat-20261117` worktree. The legacy `pilot-ai-report-readonly-uat.mjs` remains stale (retired Odoo endpoint, HTTP 410) and should be replaced before reuse.

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

## 2026-11-13 Shopfront sync and POS audit

### Sync snapshot and receipts

- Shopfront remains read-only. Current crawler mirror contains 11,034 products, 10,855 inventory rows, 157,371 sales, 308,371 sale lines, 189,599 payments, 21 customers, 109 suppliers and 2,386 purchase orders. Snapshot time: 2026-11-13 13:09 UTC.
- Latest inventory receipt 34 imported 10,855 rows to each outlet. Both SKR (outlet 87) and Demo (outlet 1) report 355 business updates, 0 skipped and 0 errors. All 10,855 inventory quantities match the crawler snapshot in both outlets; do not overwrite stock from an older snapshot without considering intervening POS movements.
- Both outlets contain 157,371 Shopfront sale identities. SKR has no missing or extra source identities; Demo has one POS-only identity. Header total mismatches: 0. Each outlet has 308,371 sale lines with no missing, extra, duplicate-key or unmapped-product rows, and 189,599 payments with matching amount, status and tender signatures.
- There are 381 sale-line `unit_price` differences whose source-vs-POS pricing meaning has not yet been classified. Nineteen source `PARKED` sales differ from native POS `VOIDED`; preserve the native action until source action history is verified. These differences prevent a claim of complete sales parity.
- Each outlet maps all 2,386 source purchase orders with no missing IDs, extras, skipped rows or invalid mappings. Reconciliation reports 106 field differences, including `total_cost` sub-cent precision examples. Full field-by-field classification remains open.
- Latest extension-data task 451 is `partial`: Shopfront returns HTTP 403 for `receipts`, `users`, `roles`, `transferees` and `customerDisplays`; sale key enumeration is unavailable, `pageRules` is absent from the API schema, promotions have hit rate limits, and 163 customer-balance rows remain source-only. These are explicit coverage gaps, not successful imports.
- A full sales reconcile request previously hit the public crawler gateway's 524 timeout. The local crawler volume is an empty SQLite file and the remote crawler database port rejected a direct local connection, so this turn could not re-run the full live row-level reconcile. The sales endpoint now fetches headers, lines and payments concurrently under one shared six-request semaphore to reduce latency without multiplying total load. Crawler syntax compilation and focused import/reconcile tests pass after fixing an indentation error in the sales-import receipt block.

### POS checkout audit

- Live database read-only inspection: Demo outlet 1 and SKR outlet 87 each have one open Register #1 session from 2026-11-10, $100 opening float, and zero currently `PENDING` sales. The sessions are stale and span multiple days; a cashier must reconcile the physical drawer and close each shift with its actual counted tender totals. Do not auto-close or invent the count.
- Recent 30-day ledger totals match across outlets: 5,008 `COMPLETED`, 2 `PARKED`, 1 `REFUNDED`, and no `PENDING`; Demo has 24 `VOIDED`, SKR 22. These are aggregate counts, not proof of per-sale history parity.
- Cash checkout uses server quote and GST, five-cent cash rounding, change, split payments, an idempotency key, and stock deduction only after settlement. Focused Java tests cover these paths, insufficient stock, quote changes, repeat checkout, refund stock return, session open/close idempotency and blocking close while an unpaid sale remains. EFTPOS remains unavailable in the active native register UI until a terminal is connected and validated.
- Verification on 2026-11-13: POS Java 21 focused suite, 24 tests passed; crawler import/purchase reconcile suite, 97 tests passed; POS UI typecheck passed; UI unit suite, 218 tests passed.
- Authorized Demo live acceptance completed through the Orithos API on the dedicated Demo Register #2 (register 249), without touching the stale Register #1 session: session 8 opened with a $0 float; product 11653 (Shopfront mapped, active, $0.49 incl. GST, 10% GST, stock 10) was quoted at $0.49 / GST $0.04, paid in cash with $0.50 tender; receipt sale 314758 / `INV-1794582996481` recorded $0.49 tender value, +$0.01 cash rounding and $0 change. Full refund sale 314759 reversed $0.49 / GST $0.04 and -$0.01 rounding. Inventory movements 12/13 record -1/+1; readback stock is 10. Closure 6 records 2 transactions, expected/received $0.00 and $0.00 movement; session 8 is closed, with no pending sales. Both sale and refund remain in the ledger. This validates API checkout/refund/register accounting, not a physical EFTPOS terminal.

### 2026-11-14 continuation verification

- Re-ran crawler import, purchase-order reconcile, and supply-chain tests after the sync receipt/reconcile changes: **115 passed**. These validate the code paths and fixtures, not full live Shopfront source parity.
- Re-ran POS Java focused checkout, customer performance outlet-scope, and register-session tests: **10 passed**. Final UI unit suite: **221 passed**, including the whitespace-empty natural-sort case; final UI TypeScript check passed after all table sorting edits.
- Extended default natural ascending order to the native product and supplier lists (name with stable ID tie-break), and the native sales-history table (business date ascending). Natural sort now treats whitespace-only values as empty and keeps them after populated values. Product/supplier sorting is applied to each API page; the API page boundary is unchanged.
- A new full live `/api/pos/sales/reconcile` attempt terminated with remote exit `-1` before returning a result. Do not count this attempt as a completed reconciliation or use it to replace the 2026-11-13 recorded figures. The available read-only snapshot still shows 381 sale-line unit-price differences, 19 source PARKED/native VOIDED statuses, and the previously noted purchase precision differences. These require classification against Shopfront raw sale/action history before any write.
- Full read-only mirror-to-ledger reconciliation completed on the server with bounded sale-ID batches (snapshot `MAX(sales.synced_at)=2026-11-13 16:46:26 UTC`, source mirror store `skr` compared separately with Demo and SKR outlets): SKR has 157,371 source/native sale identities with no missing or extra IDs; Demo has 157,371 source and 157,372 native, with one native-only identity. Both have zero header-total differences, 189,599 payments with zero signature/count mismatches, and no missing/extra/duplicate sale-line keys or unmapped line products. Each outlet has 19 `PARKED` source → `VOIDED` native status differences and the same 381 `unit_price`-only line differences. Preserve native void states pending Shopfront action-history evidence.
- The 381 price differences were caused by a confirmed import precision bug: crawler persists Shopfront `basePrice` as a four-decimal `unit_price`, while `ShopfrontNativeSaleImporter` rounded that field to two decimals before storing it in `sale_item.base_price` (scale 4). New imports now retain four-decimal unit prices; a regression test demonstrated the old failure (`2.3456` became `2.35`). Historical sales were not replayed because the current upsert rewrites status and rebuilds child rows; do not replay history as a price-only repair. Verify new receipt parity after the next scheduled sync and design a separately audited targeted correction before changing existing ledger rows.
- This sales reconcile does not establish inventory, product, purchase-order, customer-source or extension-data parity; the 2026-11-13 inventory receipt and purchase-order figures remain the latest recorded evidence. No duplicate crawler job was started. Recheck each store's terminal job receipt and snapshot timestamps before treating those figures as current.
- Rechecked POS live acceptance remains limited to the authorized Demo cash sale/refund/register flow recorded above. EFTPOS is disabled. Demo and SKR Register #1 still have stale open shifts from 2026-11-10; reconcile against physical drawer counts before closure. The focused checkout suite and prior API acceptance do not prove every physical tender or every production browser path.
- Fresh read-only server-container checks after the 2026-11-13 17:00 UTC daily sync: `sync_run 257` completed with 217 sales imported to SKR and 217 to Demo; both native receipts returned `IMPORTED`, `native_skipped=0`, and `native_unmatched_lines=0`. The source mirror sales snapshot advanced to `2026-11-13 17:00:13.999512 UTC`. This incremental batch intentionally sent no product or inventory rows; its `inventory=0` is not a fresh stock receipt.
- Extended-data `sync_job 466` reached terminal `partial` at `2026-11-13 17:07:04 UTC`, with heartbeat advancing while active. It archived 2,073 readable extension records, including 677 promotions, 1,143 closures, 17 tax rates, 4 payment methods and 2 customer payments; the latter were imported to each outlet. Known gaps remain explicit: Shopfront 403 on receipts/users/roles/transferees/customerDisplays; no enumerable `saleKeys` root; no `pageRules` query root. Do not treat this task as full extension parity.
- Current product reconciliation against source `skr` finds 11,034 source IDs, 0 missing in either outlet and 11,496 POS product IDs per outlet. All 462 POS-only products are referenced by historical purchase orders; there are no unexplained POS-only products and no deletion occurred. 10,855 products are catalog-confirmed active/current in this snapshot, 3 are `NOT_ACTIVE`, and 179 historical product IDs are not confirmed by the current catalog but remain referenced by sales; preserve them.
- Current inventory manifest is complete at `2026-11-13 16:44:50 UTC`: SKR matches all 10,855 source rows, with 0 missing, extra or quantity-mismatched rows. Demo has 0 missing/extra rows and one mismatch: Shopfront product `11eeaa99e98485dca15f0261eda38a85` (`CAD CARAMELLO KOALA 15GM`) source quantity 10 vs Demo quantity 11. The Demo product's only observed inventory movements are the prior acceptance sale −1 and refund +1, net zero; those occurred before this inventory snapshot and do not explain the current one-unit gap. Classify this as unresolved; do not overwrite without a new source snapshot and movement-aware repair.
- The Demo-only Shopfront sale identity is `parity-probe-do-not-use`, invoice `PROBE`, `VOIDED`, $1.00, business date 2026-11-10. It is a retained manual audit probe, not missing Shopfront sales; do not delete it. Stable sales snapshot reconciliation otherwise remains: zero missing source IDs, zero header-total differences, 189,599 payment signatures/counts equal, zero missing/extra/duplicate/unmapped line keys; each outlet has 19 source `PARKED`/native `VOIDED` differences and 381 four-decimal unit-price differences. The unit-price importer fix is local and was not present in the recorded online receipt; verify against a subsequent genuinely changed source sale after approved deployment.
- Purchase-order reconciliation currently finds all 2,386 IDs mapped in both outlets with no missing/extra/skipped/broken orders or unmapped lines. The runtime reconcile code reports 106 `total_cost` header differences and 2 `expected_total` field differences. Independent decimal classification shows 105 `total_cost` and both `expected_total` differences round to the same cent; one total-cost difference lies exactly across a half-cent boundary (`17032.4350` source header vs `17032.43496` native header), while both source and POS `expected_total` equal `17032.43`. Treat that single-cent report variance as unresolved until the complete source-vs-native line/fee semantics are proven; do not rewrite PO headers.
- Service provenance caveat: crawler `/healthz` fingerprint from the running container was `6b0da739a66a9e33369caf270b9bb9ce52aefe109b0e8110236654db2e3ba432`, while the current local crawler source fingerprint was `2b3ca50737968daa51a5292e5b46e7eb41a1b45c2ae483eece88147422046621`. The current reconcile HTTP responses were gathered inside the running service and may reflect this different deployed source; match the runtime image to a commit before using new reconcile behavior as release evidence. Public crawler API probes from this workstation returned 403; internal server-container reads succeeded.
- Release is pending: local `main` remains one commit ahead and thirteen behind `origin/main` at the latest check, with 100+ modified/untracked paths in the shared checkout. POS `AGENTS.md` also requires the exact backend candidate SHA to pass the approved Java 21 `mvn -B clean verify` workflow before any push. No push or deployment was made from this mixed working tree.

### 2026-11-14 fresh verification and live receipts

- Fresh local checks on 2026-11-14: POS Java 21 focused checkout/import/register/refund suite **33 passed**; POS UI unit suite **221 passed**; POS UI TypeScript check passed; crawler full pytest suite **331 passed**. These are local code checks, not proof of production parity.
- Read-only version probes to both SKR and Demo report frontend/backend SHA `69183820d534f3e7f56b0504a98c5f4563928b0a` (built 2026-11-13 17:19 UTC). Crawler `/healthz` still reports fingerprint `6b0da739a66a9e33369caf270b9bb9ce52aefe109b0e8110236654db2e3ba432`; the local crawler working tree has uncommitted source changes, so those changes are not proven deployed.
- Read-only crawler status at 2026-11-13 17:36 UTC: daily sync job 467 completed for Adelaide dates 2026-11-13 through 2026-11-14, sending 217 sales; customer job 468 completed with 21 source customers. Extended-data job 469 is terminal `partial`: readable counts include 677 promotions, 1,143 closures, 17 tax rates, 4 payment methods, 6 price lists, 7 customer groups and 2 customer payments; customer payment import returned 2 rows for each of `skr` and `demo`. One permission-denied error remains. No inventory snapshot ran in job 467, so inventory evidence remains the 2026-11-13 16:44:50 UTC complete manifest and its one unresolved Demo quantity difference.
- Current crawler coverage read shows 11,034 products, 10,855 catalog-current items (10,852 active, 3 inactive), 10,855 inventory rows, 157,371 sale headers, 308,371 sale lines, and 21 customers. The extension-data sync is still not full parity; receipts/users/roles/transferees/customer displays remain permission/schema gaps recorded above.
- Live POS currently runs SHA `69183820...`; `origin/main` has since advanced to `fedc16fd...`. Local checkout is diverged (1 local commit, 15 remote commits) and has extensive pre-existing edits and artifacts. The four-decimal sale-importer correction and customer/sorting UI changes remain local and are not present in the live SHA. Backend release must use a candidate whose parent is current `origin/main` and pass the exact-SHA Java 21 candidate workflow before push. No deployment was produced in this verification pass.
- Candidate release follow-up: candidate `4f9bbe4d038e18fc77fa3d744baa413c01954794` was built on parent `fedc16fd805bba29c5b90755415cdc894e545d47` (current `origin/main`) and dispatched to workflow run `43476322079`. GitHub accepted the dispatch, but the run failed in 3 seconds with zero steps, no runner name, and an empty log archive. The latest regular Java workflow run `43475807838` has the same no-runner/no-steps result; this is CI infrastructure evidence, not a Maven test failure. Do not push the backend until the approved candidate workflow actually runs `mvn -B clean verify` on the exact SHA.
- The current live receipts do not clear previously unresolved data differences: Demo inventory has one product quantity mismatch; 19 source `PARKED`/native `VOIDED` sales and 381 historical unit-price differences remain; purchase-order header comparison retains one half-cent-boundary cent variance. Preserve ledger states until source history and line/fee semantics establish an authorized correction.
- Cash POS flow remains supported by the 33 passing focused tests and the retained Demo cash sale/refund/register acceptance recorded above. EFTPOS remains disabled. This does not certify every browser workflow, promotions/member pricing, or physical terminal integration; the stale Register #1 sessions still need actual drawer counts before closure.

### 2026-11-14 purchase sorting follow-up

- Native purchase report now defaults to natural ascending Name order. Equal values use natural ascending stable IDs; empty values stay last. Clicking another report column initially sorts ascending. Regression test first failed on `Item 10` / `Item 2` lexical ordering, then passed with the shared natural comparator.
- Verification after this edit: purchase report tests **5/5**, POS UI full unit suite **222/222**, POS UI TypeScript check passed, and ESLint on the three changed UI files passed.
- Shared `DataTable` and `ListTable` already use the natural comparator and default to first-column ascending; native product, supplier, sales-history, inventory report, and sales-report trends are also ascending in the local working tree.
- `/api/orders` pagination now uses a database natural sort key for the first displayed “From” name before `LIMIT/OFFSET`, then `po.id ASC`; blank names are last. Numeric runs are normalized by significant digit length and value, so `Supplier 2` precedes `Supplier 10` across page boundaries. The focused mapper query-contract test passed **1/1** after first failing against the old created-time ordering. The exact SQL also executed successfully on an isolated local PostgreSQL 18 cluster with `Supplier 1`, `Supplier 2`, `Supplier 02`, `Supplier 10`, `X 1`, NULL and blank values; the instance is stopped. Exact-SHA Java 21 CI and live API/page verification remain required before release.
- Release status is unchanged: current POS checkout is still dirty, ahead 1 / behind 15 from `origin/main`, and contains unrelated local edits/artifacts. Do not push from this mixed checkout. The earlier exact-SHA Java 21 candidate workflow was accepted but failed before any runner step (no runner/log); `gh` CLI is unavailable in this workstation environment. Backend candidate push remains blocked until the required exact-SHA workflow completes successfully.

### 2026-11-14 POS checkout audit follow-up (local candidate, not deployed)

- The Sell page exposed manual line discounts, but the quote adapter dropped `discountPercent` and the Orithos request DTO had no discount field. Quotes/GST and cash checkout therefore used the undiscounted outlet price. The discount now flows through quote → quote signature → checkout; the server validates `0..100`, calculates the discounted line amount and GST, and rejects discounts for products with `prevent_manual_discounts`. The controller enforces `sell.discount` on both quote and checkout, and the UI hides the Discount action without that permission.
- Discounted amounts are persisted in `sale.total_discount` and per-line `sale_item.savings`; refund rows reverse line savings and the sale header discount. Checkout idempotency now hashes expected totals/GST, unit price, tax rate and normalized discount, so a reused key with changed commercial terms conflicts instead of replaying a prior receipt. Cart identity also includes discount percent.
- Gift-card tenders are rejected before sale/payment writes because the Orithos gift-card balance ledger is not enabled. EFTPOS remains disabled pending terminal confirmation. Cash, refunds, and register lifecycle have prior Demo acceptance evidence recorded above; that does not verify this unpublished checkout change.
- Code audit confirms current checkout still uses outlet product price and does not evaluate imported customer price-list rules or promotion rules. Those workflows are not certified or implemented by this follow-up; do not claim member pricing/promotions parity. Shopfront extension job 469 remains `partial` with a permission-denied/schema gap. Inventory, historical sales and purchase-order differences listed above remain unresolved and must not be overwritten without source/movement evidence.
- Follow-up audit confirmed a material checkout omission: `customer.price_list_id` and `customer_group.price_list_id` can be populated by Shopfront customer import, while quote/checkout previously priced every line from the outlet catalog price. The source schema also has quantity price tiers, minimum rules, classification exclusions, and promotion constraints not represented by the current native price-list tables/import. New quotes and new checkouts now fail closed for customers with a direct or group price-list assignment, with an explicit unsupported-pricing error; ordinary customers remain on outlet prices. Full customer pricing and promotion evaluation still require faithful ingestion/schema/engine work and must not be reported as complete.
- Verification after the fail-closed guard: `CheckoutServiceFlowTest` + `RefundServiceTest` **13/13** passed; `git diff --check` passed. This still does not satisfy the exact-SHA Java 21 remote workflow or live POS acceptance.
- Verification on this candidate: `CheckoutServiceFlowTest` + `RefundServiceTest` **12/12**; POS UI unit tests **220/220**; UI TypeScript check passed; focused ESLint exited 0 with 12 existing warnings. These are local checks, not the required Java 21 exact-SHA `mvn -B clean verify` workflow or live acceptance.
- No commit, push, or deployment was made. Exact-SHA Actions runs previously failed before runner startup because GitHub reported account billing/spending-limit failure. Do not bypass the gate. After billing is restored, commit only scoped changes on the maintained `main` release path, run the approved exact-SHA workflow, then deploy and recheck both store receipts and the Demo open/sell/refund/stock/close workflow. Physical drawer counts are still required before closing the stale live sessions.

### 2026-11-16 Outlet/register work context (local candidate, not deployed)

- The authenticated outlet now comes from the access JWT in `/api/auth/me`; refresh tokens retain outlet and per-browser-session identity. Refresh rotation is isolated by session ID, logout revokes that session, and password change advances the user's refresh-session version.
- Operational outlet access no longer inherits `user_reporting_outlet`. Store administrators can select outlets in their vendor; other staff are limited to their assigned outlet. Outlet/register option APIs follow the same boundary. A dedicated operational multi-outlet membership/assignment UI remains future work.
- The Location selector no longer offers Global Mode, which had no server-side multi-outlet semantics. The selected register is restored from device storage and drives Sell and Close Register. Location changes clear the active cart only after confirmation and block while checkout/refund/close recovery is pending; changing context refreshes register and product state. Logout clears the saved location.
- Local verification: POS UI `npm run typecheck` passed; `npm run test:unit` passed 240/240; focused ESLint passed without warnings; `git diff --check` passed. Java 21 focused backend tests passed 18/18, including controller assertions for outlet-preserving refresh, JWT-scoped `/me`, outlet/register validation, outlet access, and per-session refresh tokens. The required exact-SHA `mvn -B clean verify` workflow and live acceptance remain outstanding.
- The local candidate remains on `main` from parent `738da221`; it has not been pushed or deployed, and no live POS write was made. A prior exact-SHA candidate workflow attempt (`43810726434`) was blocked before checkout because GitHub reported account payment/spending-limit failure, so the current candidate has no remote Java 21 verification yet. Keep it local until that workflow can start and pass, then verify the deployed SHA and outlet/register behavior in a non-production acceptance environment.
