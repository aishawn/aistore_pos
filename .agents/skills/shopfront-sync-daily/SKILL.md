---
name: shopfront-sync-daily
description: Queue and monitor the daily incremental Shopfront sync, including sales overlap, catalog checkpoints, inventory refresh, and optional supply-chain mirroring.
---

# Shopfront Daily Sync

Use the persistent `sync_jobs` queue. The scheduled run is 02:00 `Australia/Adelaide` and rechecks the recent completed business-day window.

1. Inspect `/api/sync/status?store=skr` and avoid a second active job.
2. Queue with `POST /shopfront-sync-daily?store=skr` or `POST /api/stores/skr/sync`.
3. Poll status until a terminal state, then inspect `/api/sync/runs`, `/shopfront-audit`, and `/shopfront-reconcile` for each affected date.
4. Confirm the catalog checkpoint moved only after a successful source read and downstream mirror acknowledgement.

The first catalog run is full. Later runs use Shopfront `updatedAfter` and `lastStocktakedAfter` filters and merge changed product IDs. If either filter is unsupported or fails, retain the previous checkpoint and report the failure. Supplier and purchase-order syncing requires `see_suppliers`, `see_stock_management`, `SHOPFRONT_ENABLE_SUPPLY_CHAIN=true`, and fresh OAuth authorization; it remains a read-only shadow mirror. Do not call queued as completed or write formal Odoo purchases as part of this skill.
