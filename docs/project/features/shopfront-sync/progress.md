# Shopfront Sync Progress

Updated: 2026-11-06. Owner: TBD.

## Current candidate

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
