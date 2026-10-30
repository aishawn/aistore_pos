---
name: shopfront-audit
description: Audit Shopfront crawler and Orithos staging coverage, source ID mismatches, sync jobs, and data quality without mutating business records.
---

# Shopfront Audit

Use read-only crawler endpoints for the requested store, normally `skr`:

- `/healthz`, `/api/sync/status`, `/api/sync/runs`, `/api/sync/coverage`, `/api/pos/coverage`.
- `/api/pos/products/reconcile` for source ID comparison and classification of POS-only products.
- `/api/suppliers` and `/api/purchase-orders` for the shadow supply-chain mirror.

Compare stable external IDs and business dates, not names or totals alone. Separate crawler data, POS staging, and formal Odoo records. A count difference is not evidence for deletion: preserve products referenced by historical sales and report unexplained IDs for review. Report missing OAuth scopes, disabled feature flags, unsupported fields, and stale jobs as blockers. Never expose credentials or supplier authentication fields. This skill is read-only and must not trigger imports or change production data.
