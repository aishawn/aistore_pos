# Shopfront Sync Progress

Updated: 2026-11-10. Owner: TBD.

> Historical entries retain the state and evidence from their recorded dates. For current source boundaries, enabled store ledgers, active sync jobs, and unresolved parity issues, use the root `HANDOFF.md`; do not follow older instructions to write to Odoo.

## Report refresh propagation (2026-11-10)

- POS report refresh now forwards `refresh=true` for Shopfront Sales, Inventory, Purchase and Dashboard inventory. The crawler Dashboard inventory endpoint passes the flag to the same Shopfront Reporting API loader used by the Inventory report.
- When an explicit refresh falls back to an older cached report, the report UI fails closed with a refresh error rather than implying the stale data is current. Product-page refresh keeps using its durable snapshot and does not trigger a full catalog fetch.
- Local verification passed: POS Node 24.22.1 TypeScript check and UI unit suite 213/213; focused ESLint has 0 errors and 3 existing React effect warnings; crawler full suite 261/261; `git diff --check` passed. Production rollout is pending. Crawler catalog mirror job `#197` is running; do not deploy a POS restart until that job reaches a terminal state.

## Reject conflicting product and inventory aliases (2026-11-09)

- The formal importer now groups incoming products by their resolved Orithos product identity and rejects divergent prices, GST rates, case quantity, status, cost, and related catalog fields. Source raw payload fields are normalized with the crawler's outgoing DTO shape; descriptive names and media do not block valid aliases. Existing Shopfront source mappings to the same POS product are checked as well, so a later page cannot overwrite a conflict missed by an earlier page.
- Inventory rows that map to the same POS product must agree on quantity and replenishment values before the import can update stock. Complete snapshot checks still run before inventory is cleared.
- Added regression coverage for conflicting same-barcode product aliases, valid equivalent aliases, and conflicting inventory aliases. Exact-SHA CI and deployment verification are pending; this code is not yet a production cutover authorization.
- Mapping and outlet resolution now use parameterized batches (up to 400 IDs per query) and reuse the validated targets during writes. This avoids per-row product/inventory mapping lookups on the ~11k row SKR snapshots while preserving outlet ownership checks. The safety review also found the default crawler payload only includes base `price`/`prices` in a sale-item fallback; alias conflict grouping therefore needs complete, consistently normalized source fields before any full import can pass. Follow-up CI/deployment evidence is pending.

## Orithos business import guards (2026-11-09)

- POS `main` commit `0184be2201ed58b98cfabfdaba655585c51e0831` adds fail-closed validation for formal Shopfront product and complete inventory writes. Missing price, case quantity, source status, GST mapping, inventory quantity, source-ID uniqueness, or Orithos inventory mapping prevents the batch from replacing/writing business records. Per-row database failures now abort the transaction rather than being counted as skipped successes.
- Product shelf prices are written to `product_price` for the mapped outlet; a quantity-one shelf price is added when the source sends tiers without a base row. Unknown target tax names block import, source-deleted/non-active products become inactive, and case quantity is no longer guessed as one.
- Exact candidate Java 21 workflow passed `mvn -B clean verify` (575 tests, 0 failures/errors) before push; GitHub push workflow passed. Dokploy auto-deployed the commit: SKR and Demo `/api/public/version` now both report frontend/backend SHA `0184be2201ed58b98cfabfdaba655585c51e0831`. This is runtime identity evidence only; no live import was called.
- This closes importer input/atomicity defects in source only. It does not complete Shopfront sales posting, prove source-to-Orithos data parity, or authorize SKR cutover. Keep Odoo active for SKR until full migration acceptance.

## Ledger flip to Orithos (2026-11-09)

- After Demo PG attestation, checkout loop, and partial-receive UAT, Dokploy crawler env set `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos` with `POS_IMPORT_ENABLED=true` (compose `JHfNJMWCJGqpq0_5aovzZ`). `ODOO_IMPORT_ENABLED` may remain true in env, but per-store ledger routing blocks Odoo writes while mode is `orithos` (no dual-write).
- Demo Orithos still holds seed catalogue (1 product / 1 inventory row) vs Shopfront ~10849 — first non-`source_only` sync must raise Orithos coverage before SKR native write allowlist.
- Evidence: [partial receive](../../../test-sessions/2026-11-09-demo-migration-partial-receive.md), [ledger flip json](../../../test-sessions/2026-11-09-crawler-ledger-orithos-flip.json).

## Source-only accuracy + Orithos flip prep (2026-11-09)

- Crawler `main` `75c84c6` deployed: daily sync now requeues supply-chain after `partial`/`failed` (previously waited on the last successful interval only); supply-chain persistence resets the DB session after long Shopfront reads; default `POS_API_MIRROR_BASE_URL` is empty so `ledger=orithos` does not imply a second push to the SKR UI host.
- Focused local pytest for ledger/source-only/supply-chain cases PASS. Public `/healthz` fingerprint `9c8e1ab0…` matches clean `75c84c6`. Authenticated crawler API probes from this workstation were Cloudflare-blocked during the earlier prep session.
- Evidence: [2026-11-09-crawler-source-only-status](../../../test-sessions/2026-11-09-crawler-source-only-status.md).

## Per-store ledger routing deployment (2026-11-09)

- Crawler `main` now routes each store's regular imports to exactly one configured ledger (`odoo` or `orithos`); unconfigured stores retain the legacy Odoo route. `source_only=true` jobs skip both ledgers, and manual Orithos imports reject stores not explicitly selected for Orithos. Deployed crawler source fingerprint `4bc51b093c60019d925ef671d3a79c2e0dca9b170f224a16d5cc093a2bbf82fc` matches local `main` at `9cd7745` (`fix: improve supply-chain heartbeat and report diagnostics`) including `83181b9` (`fix: release database connection during supply chain reads`). Full local fixture suite: 229/229 PASS.
- Public `https://crawler.orithos.com.au/healthz` returns 200 with the fingerprint above. These prove deployed source identity and local routing/parser behavior only, not a production ledger switch or business-data parity.
- Read-only authenticated SKR sync status (2026-11-09): no queued/running jobs. Job #37 (`daily_sync` `2026-11-08`, `source_only=true`) is `completed`; the earlier “stuck at supply_chain” reading was superseded by completion and later supply-chain child jobs. Job #36 stays `partial` historically (`sales_report_unavailable`, 0 report rows vs 114 GraphQL sales before query/timeout fixes). Fresh `GET /api/source-reports/sales?store=skr&from=2026-11-08&to=2026-11-08&refresh=true` now returns 1 outlet row with transaction count 114 (matches archived sales). Source-only supply-chain jobs #41 and #45 `failed`: #41 hit `Can't reconnect until invalid transaction is rolled back` before the pre-fetch `db.commit()` fix; #45 failed with `AdminShutdown` during PostgreSQL restart mid persist (deployment window). Job #44 (`daily_sync` `2026-11-09`, `source_only=true`) `completed`; follow-up #45 supply-chain needs a non-deploy-window retry to refresh crawler purchase-order archive only.
- POS staging coverage and row-level product/inventory reconciliation exceeded 20 seconds. POS database read-only connection also timed out after the TCP port probe succeeded. Therefore current Orithos source identity, live ledger mode environment and source-to-Orithos reconciliation remain unverified. No manual Shopfront sync job or ledger environment change was made. Demo authenticated reads showed vendor/outlet `1/1`, one register, one Sell product, no active register session, and `/api/retail/payment-methods` reported `nativePosEnabled=true` with Cash and EFTPOS assignments. Thus Demo's native write gate is enabled even though its PostgreSQL isolation is unverified; treat it as a write-capable environment and do not perform sales/receipt UAT until database isolation is proven. During verification, an attempted non-mutating gate probe used the register-open route and created an empty register session; it was immediately closed with zero cash and zero EFTPOS, and the current-session API returned null. This leaves an auditable zero-value session/closure record; no sale, refund, inventory, purchase or Shopfront write occurred.
- POS `main` documentation commits `3a3a6d73`, `f95b856f`, and `b7885808` are pushed; Dokploy deployment of `b7885808` is done and Demo/SKR/App frontend/backend runtime SHAs match. They contain migration evidence only and do not change business behavior.
- Next: retry source-only supply-chain outside deploy windows; optionally rerun source-only daily for `2026-11-08` to clear job #36. Once POS staging timeouts are resolved and count parity is proven, validate the Orithos test tenant and authorize one store at a time. Do not disable Odoo or switch SKR based on this deployment alone.

## Dashboard sellable-units coverage (2026-11-09)

- The crawler previously returned `available: false` whenever any Inventory Reporting API row lacked case level, item level, or a positive case quantity. The source aggregation already computed valid rows, but the API discarded that subtotal and the Dashboard showed `—`.
- The dashboard response now reports convertible and excluded row counts plus row coverage. A fresh report with at least one convertible row returns its known sellable-units subtotal and `complete`/`partial` status; zero coverage, stale snapshots, and upstream failures remain unavailable. The POS Overview labels partial values as a known subtotal with row coverage and excluded row count.
- Crawler full suite passed 167/167; frontend inventory metric tests passed 9/9. Frontend `npm run typecheck` is blocked because this checkout lacks `tsc` and runs Node 22 while the project requires Node 24+. SKR/Demo runtime verification and deployment remain pending; this change does not prove exact parity with Shopfront Dashboard filters or that omitted rows have zero stock.

## Inventory coverage summary recovery (2026-11-08)

- Live SKR authenticated read-only check: Inventory rows already show Shopfront stock, case cost, price and category. The bottom Shopfront summary fails because it independently calls the crawler Reporting API, while the product rows read the Odoo Shopfront mirror.
- Candidate uses the same complete Odoo-backed inventory snapshot to report active source products, cost coverage, mapped references, inventory row coverage, positive source units and snapshot time. This removes the unnecessary reporting-proxy dependency from the inventory page summary and keeps Shopfront values distinct from Odoo balances.
- Read-only `aipos_uat` comparison remains 10,849 active source products, 10,852 source inventory rows, 50,914 positive source units, 0 stock mismatches; 7 positive source costs are still absent in Odoo standard cost. No data write was issued. Candidate checks and deployment state are in [validation](validation.md).
- Runtime `b09500eaa4e8aeb91f18af09d9b59c567dd934c5` reached both SKR and Demo. Live SKR confirmed stock-ranked rows with source cost and units, but showed that the coverage summary content was hidden while its history-style section was collapsed. Follow-up `9dc1f9a7f1a3c7f8e4a4d170589d0f266058611c` is deployed; the always-visible summary reports 10,849 active/mapped/inventory-covered products, 50,914 positive units, and cost coverage of 9,993 non-zero / 856 real-zero products.

## Inventory default view correction (2026-11-08)

- Live SKR API verification after the previous deployment returned 10,849 Shopfront products, 50,914 positive source units, and source/Odoo quantities matching on the full active scope. The first Products rows were zero-stock `$...` gift-card/recharge records because the catalogue is name-sorted; this was a misleading viewport, not a failed inventory sync.
- Inventory now defaults to Shopfront inventory descending when no explicit sort is supplied, so the first rows show products with stock and source cost. Explicit `sort` and `direction` URL parameters continue to override the default, and zero/negative filters remain available.
- The same audit found 7 source products with positive cost but Odoo `standard_price` still zero. The Products and Inventory views display the Shopfront read-only cost; no unit-cost write is made when source case quantity is absent or the tax basis cannot be proven.

## Inventory scope and coverage clarification (2026-11-08)

- POS commits `f2b7fb0b944520647c9a1fdd9bb245348f1c0d6d` and `68b2c7efa9c8248339277408382b5ece615c3048` are deployed on SKR. Products now reports the source coverage counts and links to the stock-ranked Inventory view; Inventory uses the same 10,849 Shopfront canonical products instead of the broader Odoo-only variant population.
- Deployed read-only verification: Products total 10,849; Inventory total 10,849; 10,849 mapped source products; 10,849 inventory rows; 0 unmapped; 0 row quantity differences; 50,914 positive units. First-page Inventory rows carried source cost and source inventory, with Odoo quantity shown separately for comparison.
- Current source cost coverage is 9,993 products with non-zero cost and 856 products reporting a real zero cost. A zero source cost remains visible as `$0.00`; it is not replaced by an invented value. Cost access remains permission-gated.

## Product / inventory parity follow-up (2026-11-08)

- POS `main` commit `fce60e3cef10322b10c578032eb9d2d16c0542b1` is deployed. Its product import maps Shopfront retail `taxRate` and purchase `costTaxRate` independently. The Odoo integration fixes `077b740` and `63c50a0bb65d6a06f6622928506857abc74eec37` are deployed; the latter resolves unique-SKU legacy product identities while retaining rejection of conflicting evidence.
- Durable sync job #29 completed: 11,030 products, 10,852 inventory rows, and 0 unmatched inventory rows. On `aipos_uat`, company 5, location `UATPI/Stock`, the latest route-equivalent comparison covered all 10,849 ACTIVE Shopfront products: 0 inventory quantity mismatches and 0 missing canonical products. For records with a valid case quantity, `Shopfront box cost / case quantity` matched Odoo unit standard cost with 0 differences.
- Authenticated SKR `/products` verification confirmed the merged catalogue fields: status, product, category, Shopfront cost, inventory, price, 30-day performance, and actions. Example `-196 LEMON P/F 6% 330ML`: source box cost `$116.75`, case quantity 30, unit cost `$3.89`, stock 128 (4 cases + 8 items), price `$8.99`, and 105 units sold over 30 days. A `$0.00` source record is a real zero, not a missing value.
- Current live source counts: 10,849 ACTIVE Shopfront products; positive stock 50,914 on the matched Shopfront inventory key scope. Odoo's 13,292 saleable variants and 51,229 positive units are broader route totals; they are not directly comparable counts. Earlier 50,992 and 51,512 totals are stale snapshots.
- Fidelity boundary: the source product API exposes `cost`, `caseQuantity`, `costTaxRate`, and retail `taxRate` separately; it does not expose a `costEx` field in the captured product query. Shopfront's source sales reports expose their own profit values. Those values can be mirrored/displayed as Shopfront data, but must stay labeled as source metrics rather than verified Odoo ledger amounts. Do not infer whether source cost includes recoverable tax from the tax-rate name alone.
- The product/inventory parity evidence does not establish full Shopfront parity across every report, purchase field, or source setting, and does not authorize a cost write when tax basis is unknown. Preserve the exact source fields and read-only history; represent unavailable or unverified fields explicitly.

## Product enrichment read states (2026-11-08)

- Current `main` candidate preserves Shopfront cost and inventory read outcomes separately: available (including a real zero), no source value, unavailable query, or restricted cost permission.
- Product table and mobile rows show the Shopfront source state and keep Odoo recorded values separately labeled. Optional cost/inventory read failures no longer masquerade as empty source records or clear the rest of product enrichment.
- This is a display/read-path correction. It does not write Shopfront cost into Odoo `standard_price` or modify inventory quantities.
- Local verification and deployment status are recorded in the corresponding dated test session and validation entry.

## Canonical product directory (2026-11-08)

- `/products` now renders the Odoo product catalogue, including its existing read-only Shopfront enrichment and source coverage indicators. `/products/odoo` redirects to the canonical directory; `/products/shopfront` already redirects there.
- Counts remain explicitly scoped: Shopfront ACTIVE source products, Odoo saleable variants, and positive available units are separate measures. The recent read-only audit found 10,849 Shopfront ACTIVE products and 13,292 Odoo saleable variants; those counts describe different populations. Its 50,992 quantity was stale: the route-equivalent Odoo read returned 51,229 positive available units, while the older Shopfront mirror snapshot reported 51,512.
- A later complete inventory comparison on `aipos_uat` found 10,852 source inventory keys with no missing/extra keys and no row quantity differences against the Odoo inventory mirror; the matched Shopfront-key scope summed to 50,914 positive units. The route-equivalent Odoo query summed to 51,229 positive units across the broader 13,292 saleable variants. The older Shopfront snapshot's 51,512 and screenshot's 50,992 are stale totals; scope and snapshot time must be shown.
- Read-only crawler API check on 2026-11-08: `/healthz` is healthy and there are no queued/running jobs. Durable job #10 (`legacy_migration`) failed at 2026-11-07 10:10 UTC because the crawler restarted; later durable job #20 (`legacy_migration`) completed at 20:21 UTC. No retry is needed for that migration.
- SyncRun #19 is a separate ID namespace from durable job #19. SyncRun #19 failed with `inventory reconciliation required for 3 unmatched source row(s)`; its saved result has no item identities, and the related `PosImportRun` detail endpoint returns 404. The current read-only product reconciliation reports 0 crawler products missing from POS (11,030 POS source-linked products). Current full inventory row comparison also found no missing/extra keys or quantity differences, but this cannot identify the three rows from the older failed run.
- No migration, retry, or business-data write was issued. Database snapshots and Shopfront source costs were not changed.

## Product catalogue count reconciliation (2026-11-07)

- The SKR product catalogue now reports Shopfront active source products, Odoo template mapping coverage, inventory-covered source products, and positive Shopfront units as separate measures. Its paginated list total is labeled as Odoo variants, so it is not mistaken for Shopfront's product count.
- Product-template mapping includes company-owned and shared (`company_id=false`) templates in the signed-in company scope. If source enrichment fails, source price, cost, and stock are shown as unavailable rather than partly populated or substituted with Odoo values.
- Read-only audit of `aipos_uat`, SKR, company 5, `UATPI/Stock`: 10,849 ACTIVE source products; 10,852 inventory rows; 51,512 positive units; 5,373 negative rows. The latest inventory snapshot was `2026-11-06T16:22:09.877859`.
- Row-level stock comparison passed for 11,005 unique mappings with zero mismatches. There are 25 ambiguous ACTIVE source references and 2 ACTIVE products without a canonical Odoo template. No source costs were written to Odoo; 281 mapped products still have zero Odoo cost despite positive source cost.
- The `/purchases?state=purchase` legacy receipt link redirects to the main Purchases view. Dokploy's GitHub `main` auto-deploy is enabled; deployment verification for this candidate is pending.
- Live UI verification exposed that an optional 30-day sales lookup failure could clear otherwise successful Shopfront product/stock enrichment. Sales performance now fails independently and leaves the source catalogue fields intact; the follow-up deployment is pending.

## Current candidate

- Inventory report and SKR Dashboard inventory KPI now read the same Shopfront Reporting API rows and share a 60-second durable cache. The old GraphQL-to-report reconstruction cache is rejected by a source-version marker and refreshed from Shopfront. Missing case/item quantities fail closed; negative-only filtering now converts cases to eaches before checking the signed balance. POS requires `shopfront_reporting_api_v1` before accepting the Dashboard KPI.
- Local focused crawler tests: 67/67 PASS; full crawler suite: 130/130 PASS after updating the mirror-only receipt assertions; frontend unit suite: 188/188 PASS; POS typecheck: PASS. Focused lint: 0 errors / 3 warnings. Live deployment/page parity remains pending.
- This is a local candidate only. It does not prove the Shopfront Reporting API query has the exact same filters as the Shopfront UI until source rows and totals are read side by side on the deployed SKR store.

- Inventory refresh now stages GraphQL product pages and commits each page together with its cursor. A retry resumes from the last committed cursor. The existing complete snapshot is kept until all staged products, inventory fields, quantities, and unique IDs validate; promotion and stage cleanup share a transaction.
- Inventory coverage exposes whether a scan is fetching or has finished pagination, plus checkpointed product count and timestamps. It does not expose cursor contents.
- Daily purchase mirror timeout, exception, skipped result, or non-completed acknowledgement marks the daily job partial with a reason rather than completed.
- The SKR Overview hides today's Orithos totals when Shopfront source reports mode is active and its source report is unavailable. Source data remains the display authority; Odoo values are not presented as a fallback.
- Odoo customer success receipts now include the top-level `item_count` expected by the crawler. This source change is in the separate Odoo `main` repository and needs its own push/deploy verification.

## Settings import (2026-11-10)

- Added crawler `settings_import` job and collectors for tax/payment/sale keys/receipts/users/roles/page rules/barcode templates/price sets/promotion categories/statements/transferees/customer displays.
- Orithos promote endpoint `POST /api/integrations/shopfront/settings:import` never overwrites Orithos-owned company settings. Not attached to daily overwrite.
- See CAP-SET feature docs under `docs/project/features/settings/`.

## Remaining parity work

1. Push and verify both repository SHAs and Dokploy runtime identities.
2. Run a controlled read-only comparison of the SKR Shopfront Inventory, Sales, Dashboard, Products, and Purchase pages against the same crawler source endpoints, date range, timezone, outlet, filters, and statuses.
3. Verify the source Profit and Profit Percentage formula and rounding against representative report rows, including zero revenue, refunds, discounts, and cost edge cases.
4. Reconcile source product IDs and statuses separately from active product count; reconcile inventory product/outlet keys and signed quantities; reconcile sales and purchase source IDs against crawler and Odoo mirror IDs.
5. Confirm the three SKR dashboard metrics on the deployed page after an acknowledged complete source refresh. Record unmatched or inaccessible fields as explicit blockers, not as parity.

No complete Shopfront-to-POS parity claim is made by local tests.
