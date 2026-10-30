---
name: shopfront-reconcile
description: Reconcile Shopfront products, stock, sales, suppliers, and purchase-order mirrors against Orithos staging and explain actionable differences.
---

# Shopfront Reconcile

Start with read-only crawler and POS coverage. Use `/api/pos/products/reconcile` to compare Shopfront source IDs and identify POS-only records; cross-check whether each is referenced by a historical sale. For other entities, compare stable external IDs and sync timestamps before totals.

Classify mismatches before proposing changes. Prefer an idempotent re-sync for missing or stale mirrors. Do not delete or deactivate records, replace business inventory, or create/receive formal purchase orders from reconciliation. The crawler supplier/order store is an archive mirror; it is not the Odoo business source of truth. Never expose credentials or supplier authentication fields.
