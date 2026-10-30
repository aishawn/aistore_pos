---
name: shopfront-reconcile
description: Reconcile Shopfront products, stock, sales, suppliers, and purchase-order mirrors against Orithos staging using stable external IDs and explain safe repair actions.
---

# Shopfront Reconciliation

Start with `/api/sync/coverage`, `/api/pos/coverage`, `/api/pos/products/reconcile`, and the relevant sync/import runs. Use `/shopfront-reconcile?store=skr&date=YYYY-MM-DD` for daily report versus Sale checks.

Classify each difference as missing in target, target-only with historical reference, unexplained target-only, field mismatch, or unavailable because of permissions/schema. Compare sale line IDs and purchase-order IDs, not names. For supplier and order differences, verify source scopes, crawler mirror counts, POS staging counts, and timestamps independently. Preserve cancellations, returns, and source deletions as auditable status changes. Do not bulk delete, auto-create ambiguous products, replace business inventory, or create/receive formal purchase orders during reconciliation. Propose a bounded idempotent repair and rerun the same comparison. Never expose secrets or supplier authentication data.
