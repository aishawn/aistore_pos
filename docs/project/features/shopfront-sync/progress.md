# Shopfront Sync Progress

Updated: 2026-11-08. Owner: TBD.

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

## Remaining parity work

1. Push and verify both repository SHAs and Dokploy runtime identities.
2. Run a controlled read-only comparison of the SKR Shopfront Inventory, Sales, Dashboard, Products, and Purchase pages against the same crawler source endpoints, date range, timezone, outlet, filters, and statuses.
3. Verify the source Profit and Profit Percentage formula and rounding against representative report rows, including zero revenue, refunds, discounts, and cost edge cases.
4. Reconcile source product IDs and statuses separately from active product count; reconcile inventory product/outlet keys and signed quantities; reconcile sales and purchase source IDs against crawler and Odoo mirror IDs.
5. Confirm the three SKR dashboard metrics on the deployed page after an acknowledged complete source refresh. Record unmatched or inaccessible fields as explicit blockers, not as parity.

No complete Shopfront-to-POS parity claim is made by local tests.
