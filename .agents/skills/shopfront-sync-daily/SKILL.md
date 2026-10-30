---
name: shopfront-sync-daily
description: Run or diagnose the Shopfront incremental daily sync, inspect its persisted worker job, and summarize sales, catalog, inventory, supplier, and purchase-order results.
---

# Shopfront Daily Sync

Use the store-local date range and the crawler's persistent `SyncJob` queue. The scheduled run is 02:00 `Australia/Adelaide`, rechecks the configured recent business-day sales window, and uses `updatedAfter` plus `lastStocktakedAfter` for catalog and inventory changes after the initial baseline. For a manual run, enqueue through `POST /api/stores/{store}/sync`; inspect `/api/sync/status` and `/api/sync/runs` until the job reaches a terminal state.

Supplier and purchase-order sync requires the Shopfront scopes `see_suppliers` and `see_stock_management`, `SHOPFRONT_ENABLE_SUPPLY_CHAIN=true`, and fresh OAuth authorization. Treat supplier and order endpoints as read-only mirrors. Do not create Odoo purchase orders or receive stock as part of this workflow. Summarize counts, date range, warnings, and failures without printing secrets.
