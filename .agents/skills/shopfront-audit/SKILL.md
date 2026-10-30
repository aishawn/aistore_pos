---
name: shopfront-audit
description: Audit Shopfront crawler and Orithos staging coverage, source-ID mismatches, sync jobs, and data quality without mutating business records.
---

# Shopfront Audit

Use the crawler's read-only coverage endpoints and `/api/pos/products/reconcile` for product-count questions. Compare external source IDs, not names or totals alone. Separate products returned by the catalog since tracking began from rows not yet catalog-confirmed, including those referenced by sales. A missing `catalog_last_seen_at` is not proof that a product is archived until a catalog sync has run after this marker was introduced; a prior sighting is also not proof the item is still active.

Inspect recent runs and job status before suggesting a repair. Do not delete, merge, rename, or deactivate products based only on count differences. Report what is measured, the missing evidence, and a safe next sync or review action. Never include credentials or supplier authentication data in output.
