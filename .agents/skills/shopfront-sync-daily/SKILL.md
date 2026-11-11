---
name: shopfront-sync-daily
description: Queue and verify a scheduled or on-demand Shopfront sync, including source freshness, catalog/inventory checkpoints, sales overlap, and SKR/Demo Orithos parity.
---

# Shopfront Daily Sync

Use the persistent `sync_jobs` queue. Syncs may run multiple times per day. Read the current crawler configuration for the active schedule and source filters; do not rely on an old fixed schedule or start a duplicate job.

1. Inspect `/api/sync/status?store=skr` and `?store=demo`; avoid a duplicate job for either store.
2. Queue the requested store with `POST /shopfront-sync-daily?store=...` or the documented `/api/stores/{store}/sync` route.
3. Poll both relevant jobs until terminal states, then inspect `/api/sync/runs`, `/shopfront-audit`, and `/shopfront-reconcile` for each affected business date.
4. Confirm source reads, catalog/inventory checkpoints, and downstream Orithos acknowledgements completed; a queued or partial job is not success.
5. Compare stable source IDs, counts, key fields, and samples between Shopfront/crawler and Orithos APIs for both stores. Check the read-only store pages for the same records and report every mismatch.

The first catalog run may be full; later runs use the crawler's supported Shopfront change filters and checkpoint semantics. If a filter or source read fails, retain the prior complete checkpoint and report the failure. Supplier and purchase-order mirror coverage depends on Shopfront scopes and crawler configuration; verify those before declaring completeness. Shopfront is read-only: never use Register. Do not call queued as completed, invent missing business data, or write to Odoo.
