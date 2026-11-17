# Shopfront Cost Reconciliation: 2026-11-18

## Scope

This audit used authenticated read-only GET requests to the production Crawler API and POS native-data endpoint for Shopfront store `skr` and POS targets `skr` and `demo`. It did not call Shopfront directly, alter business data, enqueue sync jobs, or change configuration. Shopfront `/reports/misc` visual verification remains pending because the owner deferred login. Shopfront/model API spend was AUD 0.

Crawler `/healthz` was healthy. Local Crawler source commit was `321c8d6dc4c55c875bc7cd8a1131f841c683a84d`; runtime source fingerprint was `2390ddb8be6541f76f58b63f936efe970960fac459003c2d7a35fef0e55a8d35`. POS runtime SHA was not exposed by the reconcile API. The local direct read-only connection to Crawler PostgreSQL failed because the database closed the connection during handshake; all findings below come from the authenticated API.

## Current Catalog

The most recent complete source-ID snapshot covered 10,853 catalog products: 10,850 ACTIVE and 3 NOT_ACTIVE. The latest catalog observation was `2026-11-17T19:19:44Z` and was recent at query time. Current outlet cost was available for all 10,853 products, including 855 explicit zero values; none were missing.

Both SKR and Demo reconciliation responses reported `complete_match=true`. Each target had zero mismatches in current unit cost, case cost, case quantity, retail tax name, cost tax name, status, and Shopfront source update time. Each had zero unavailable values for those fields. Name differences were 114 for SKR and 158 for Demo; every difference matched the expected POS uniqueness suffix, leaving zero unresolved mismatches. SKU was unset in both source and POS for 6,239 products.

The current code path takes the configured outlet-specific Shopfront `cost`, preserves case cost, and derives the POS unit cost by dividing by `caseQuantity` when `costPercentage` is false. Percentage costs retain their returned amount. This confirms the API mapping behavior and current POS parity; the Shopfront page labels, tax basis, and relation to `Last Case Cost` still need visual confirmation.

## Historical Cost Candidates

There are 179 legacy cost signals for products absent from the current catalog. All 179 have historical sale references, and 80 also have purchase-order references. After the previously documented scoped cleanup, all 179 POS cost fields read back null in each store. Three additional historical-sale mappings have no legacy cost signal. Source case quantity is unavailable for these historical IDs; current POS case quantity differs between stores for 7 candidates.

These old cost signals are not evidence of current Shopfront outlet cost. Do not backfill them as current cost or alter historical sale rows. The existing cost-only endpoint provides a bounded path once authoritative values and per-ID scope are verified.

## Historical Mapping Classification

The import readback reports 644 directory-outside mappings per store. Current reconciliation classifies these as 182 historical-sale mappings (179 with a legacy cost signal and 3 without) plus 462 purchase-order-only mappings. Unexplained mappings: 0. These historical rows remain separate from the 10,853 current catalog products.

## Partial Sync and Barcode Conflicts

Crawler job `#844` and SyncRun `#523` remain `partial`, despite processing 10,853 products and 10,853 inventory rows. The stored import result contains 408 unique barcode-conflict records: 204 for each store, with 196 distinct barcode strings per store. A read-only follow-up matched all 408 records to the current Shopfront product claims and original POS owners:

- 202 records (101 per store) are barcodes claimed by multiple current Shopfront products. Those 101 rows correspond to 96 distinct barcode strings per store. They are source-data conflicts, not stale POS ownership, and remain unresolved at the source.
- 206 records (103 per store) are barcodes retained by an existing POS owner but no longer declared by that owner's current Shopfront product. Of these 103 per store, 52 owners have zero stock, 10 have positive stock, and 41 have negative stock. All 206 owners are still POS `ACTIVE` and catalog-confirmed. Zero stock alone is not authorization to transfer a barcode.
- The known Doritos barcode `9310015250286` is in the stale-owner group. Its current mapped owner is `ACTIVE` with inventory `-268` in both SKR and Demo; preserve the owner and barcode.

All conflict records are now classified, but none were moved or cleared. Keep the job status `partial`; classification does not resolve duplicate source claims or establish an approved POS reassignment policy. Any future reassignment must be explicitly scoped and must preserve all product and inventory ownership, including positive and negative stock.

There was no active sync job at the time of the status query. The current source catalog observation is recent, while catalog job health is still partial/stale because the latest catalog job did not reach a clean terminal success.

## Evidence and Remaining Work

- Ignored local candidate export: crawler `.local/cost-reconciliation-live-2026-11-18.csv` and `.json`.
- Ignored local barcode exports: crawler `.local/shopfront-barcode-conflicts-run523-2026-11-18.csv/.json`, `.local/shopfront-barcode-full-classification-run523-2026-11-18.csv/.json`, and the per-store owner readbacks. These contain the row-level evidence for all 408 conflicts.
- Direct Shopfront UI `/reports/misc` and product cost management inspection remains pending.
- Define and test an explicit barcode reassignment policy before acting on any of the 52 zero-stock stale-owner rows per store. Source-duplicate claims and all owners with positive or negative stock remain protected; no barcode was moved in this audit.
- Reconcile any historical candidate only after Shopfront establishes a current authoritative cost, outlet, and case-size value. Use the existing explicit-ID cost-only path and verify every changed ID in both stores.
- No tests were run for this read-only audit. No online Shopfront calls or business writes were made; Shopfront/model cost was AUD 0.
