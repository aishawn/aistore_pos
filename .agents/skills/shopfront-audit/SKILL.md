---
name: shopfront-audit
description: Audit read-only Shopfront source coverage and crawler-to-Orithos sync status for SKR and Demo, including source ID mismatches and data quality.
---

# Shopfront Audit

Use Shopfront only as a read-only upstream reference. Never use Shopfront Register. Inspect both `skr` and `demo` because their synced source data is expected to match. Use crawler endpoints such as:

- `/healthz`, `/api/sync/status`, `/api/sync/runs`, `/api/sync/coverage`, `/api/pos/coverage`.
- `/api/pos/products/reconcile` for source ID comparison and classification of Orithos-only products.
- `/api/suppliers` and `/api/purchase-orders` for the shadow supply-chain mirror.

Compare stable external IDs, business dates, and important fields, not names or totals alone. Trace source → crawler mirror/job → Orithos API data for each store. A count difference is not evidence for deletion: preserve products referenced by historical sales and report unexplained IDs for review. Report missing OAuth scopes, disabled required flags, unsupported fields, partial jobs, and stale snapshots as blockers. Never expose credentials or supplier authentication fields. This skill is read-only and must not trigger imports or change production data.
