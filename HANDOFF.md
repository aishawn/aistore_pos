# Handoff — Orithos Native Ledger Cutover

> Generated: 2026-11-10 ~21:30 (UTC+8)  
> Project: Orithos POS (`orithopos-master` / GitHub `aishawn/aistore_pos`, branch `main`)  
> Session: Orithos Native Ledger Cutover (Shopfront sales → native `sale`/`sale_item`; reports/UI Orithos-only)  
> Related Chinese notes: `../SHOPFRONT_ORITHOS_HANDOFF_2026-11-10.md`  
> Tip SHA: `31bd78b0` (dashboard Store Pulse + native history/inventory + customer/price-list Orithos routes; customer code store-prefix)

## Goal

Orithos is the **live retail ledger** for Demo (vendor 1 / outlet 1) and SKR (vendor 55 / outlet 87). Shopfront remains the external SoT; crawler syncs into both tenants. Browser pages read **pos-api only**. Odoo stays non-writable (no dual-write).

## Page audit (this follow-up)

| Page | Live finding before `7043eaf0` | Fix |
|------|--------------------------------|-----|
| `/dashboard` Store Pulse | Stuck on “Shopfront reports unavailable” (old `/api/shopfront-source`) | `useOverview` → `GET /api/reports/native-overview`; pulse shows Orithos sales/margin/inventory |
| `/reports/dashboard` | Already OK (`$5,035.80` / 161 yesterday) | Inventory metric now from `product_inventory` |
| `/history` + Sales History modal | `native-sales-history` HTTP 500 | Adelaide business-day SQL + safe date mapping |
| `/customers` | Odoo session gate; native `/api/customers` empty (1 row total) | UI routes to Orithos auth + `/api/customers`; **Shopfront customer import still missing** |
| `/api/price-lists` | Classic filter 410 | Allowlisted + outlet-scoped controller |

## Completed this session

### Phase 1 — Native sales ledger
- Schema: `sale.source_system` + `sale.external_id` (unique with outlet).
- `ShopfrontNativeSaleImporter`: upsert Shopfront payloads into `sale` / `sale_item` / payments; **no historical stock moves**.
- Continuous path: crawler `sales:upsert` → mirror **and** native writer.
- Backfill: `POST /api/integrations/shopfront/sales:promote-native` (batched: `store_key`, `business_day`, `after_external_id`, `limit`).
- Adelaide day filter: offset/Z → Adelaide; naive timestamps treated as Adelaide local.
- Money: prefer payload `total_price` / `totalPrice`; avoid float drift on promote.

### Phase 2 — Reports / UI on pos-api
- `/dashboard`, `/reports/dashboard`, `/reports/sales`, `/history` → native overview / sales history (`source=orithos_ledger`).
- Overview Store Pulse → `GET /api/reports/native-overview` only.
- AppShell Sales History modal → `NativeSalesHistoryModal` (no Odoo overlay) — commit `42336225`.
- `/api/shopfront-source` → HTTP **410**.

### Phase 3 — Domain cutover (partial ship)
- Sell / register / close / customers / suppliers / inventory report surfaces moved toward Orithos where already present.
- **Not fully cleared:** products catalogue (still Odoo-primary in main nav), transfers/replenishment, customer satellites (balances/gift cards), `/sell` classic Odoo register, some settings/AI Odoo reads. See “Next plan” below.

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
| DB | — | `POSTGRESQL_URL` |

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

## Subsequent plan (recommended)

### P0 — Keep ledger green
1. After each Dokploy deploy: confirm `/api/public/version` SHA; re-run day-totals for yesterday Adelaide.
2. Watch crawler scheduled syncs (`02:30` / `23:00` Adelaide); SKR and Demo must move together.
3. Never re-enable Odoo writes (`node .local/read-cutover-config.cjs`).
4. Keep `SHOPFRONT_STAFF_*` in crawler Compose for inventory Misc.

### P1 — Finish Odoo / Shopfront UI retirement (by domain)
Priority from live inventory (migrate writes before leftover report mirrors):

1. **Products + stocktake + categories** (`/products` still Odoo-primary).
2. **Purchasing leftovers** — transfers, replenishment RFQ, invoice→PO confirm/receive.
3. **Customer satellites** — balances, gift cards, pricelists, `/customers/odoo`.
4. **Cash / `/sell` classic Odoo register / manage-cash** — retire once Orithos register is sole path.
5. **Shopfront report pages** — `/reports/inventory`, `/reports/purchase`, shopfront dashboard redirects already partly done; ensure no callers of `/api/shopfront-source`.
6. **Settings + AI Odoo reads** — company, payment fallback, assistant ops preview.
7. **Delete dead `/api/odoo/*` BFF** only after zero callers + Java 21 verify.

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
