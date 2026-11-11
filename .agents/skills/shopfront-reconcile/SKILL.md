---
name: shopfront-reconcile
description: Reconcile read-only Shopfront products, stock, sales, suppliers, and purchase-order source data against Orithos for SKR and Demo using stable external IDs and explain safe repair actions.
---

# Shopfront Reconciliation

Start with `/api/sync/coverage`, `/api/pos/coverage`, `/api/pos/products/reconcile`, and the relevant sync/import runs for both stores. Use `/shopfront-reconcile?store=skr&date=YYYY-MM-DD` and repeat for `demo` for daily report versus Orithos Sale checks.

Classify each difference as missing in Orithos, Orithos-only with historical reference, unexplained Orithos-only, field mismatch, or unavailable because of permissions/schema. Compare stable source IDs and sale line IDs, not names. For supplier and order differences, verify source scopes, crawler mirror counts, Orithos counts, and timestamps independently. Preserve cancellations, returns, and source deletions as auditable status changes. Do not bulk delete, auto-create ambiguous products, replace business inventory, or write to Odoo during reconciliation. Propose a bounded idempotent Orithos repair and rerun the same comparison. Never expose secrets or supplier authentication data.
