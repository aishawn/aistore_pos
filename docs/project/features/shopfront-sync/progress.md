# Shopfront Sync Progress

Updated: 2026-11-06. Owner: TBD.

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
