# Shopfront Cost Reconciliation: 2026-11-18

## Scope

This audit used authenticated read-only GET requests to the production Crawler API and POS native-data endpoint for Shopfront store `skr` and POS targets `skr` and `demo`. A follow-up also inspected the signed-in Shopfront product editor and `/reports/misc` landing page. No business data was changed, no sync job was enqueued, and configuration was not changed. Shopfront/model API spend was AUD 0.

Crawler `/healthz` was healthy. Local Crawler source commit was `321c8d6dc4c55c875bc7cd8a1131f841c683a84d`; runtime source fingerprint was `2390ddb8be6541f76f58b63f936efe970960fac459003c2d7a35fef0e55a8d35`. POS runtime SHA was not exposed by the reconcile API. The local direct read-only connection to Crawler PostgreSQL failed because the database closed the connection during handshake; all findings below come from the authenticated API.

## Current Catalog

The most recent complete source-ID snapshot covered 10,853 catalog products: 10,850 ACTIVE and 3 NOT_ACTIVE. The latest catalog observation was `2026-11-17T19:19:44Z` and was recent at query time. Current outlet cost was available for all 10,853 products, including 855 explicit zero values; none were missing.

Both SKR and Demo reconciliation responses reported `complete_match=true`. Each target had zero mismatches in current unit cost, case cost, case quantity, retail tax name, cost tax name, status, and Shopfront source update time. Each had zero unavailable values for those fields. Name differences were 114 for SKR and 158 for Demo; every difference matched the expected POS uniqueness suffix, leaving zero unresolved mismatches. SKU was unset in both source and POS for 6,239 products.

The current code path takes the configured outlet-specific Shopfront `cost`, preserves case cost, and derives the POS unit cost by dividing by `caseQuantity` when `costPercentage` is false. Percentage costs retain their returned amount. This matches the source field contract and current POS parity. The signed-in product-editor UI and `/reports/misc` landing page were read-only inspected on 2026-11-18; the exact Inventory At Date report output was not opened.

## Shopfront Cost Field Semantics

The public [Products object documentation](https://developer.onshopfront.com/documentation/Objects/Products) distinguishes the outlet's current case cost (affected by Vendor settings), the outlet's `lastCost` (last case cost), and the outlet's `averageCost`. It also defines the `Cost.cost` value as including tax. The [Cost Tax Rate ID documentation](https://developer.onshopfront.com/documentation/Types/Cost%20Tax%20Rate%20ID) says the `inherit` value uses the product's sale tax rate when handling cost. These are distinct fields and settings; do not treat current outlet cost, last case cost, and average case cost as interchangeable.

The public [Special Reports documentation](https://developer.onshopfront.com/documentation/Reporting/Special%20Reports) shows the Inventory At Date report returning both `Last Case Cost (Ex)` and `Last Case Cost`, plus stock values excluding and including tax. Its example reports `$12.50` ex tax and `$13.75` including tax. This documents the report API's paired fields, but does not prove that the signed-in `/reports/misc` page uses the same report, filters, or display settings.

A live read-only Crawler source-product GET fetched `JIM BEAM WHITE LBL 37% 700ML` from Shopfront at `2026-11-17T20:19:02Z`: outlet case cost `$522.31`, case quantity `12`, `last_case_cost` `$522.31`, and `average_case_cost` `$522.21`; exactly one outlet cost matched. The non-percentage POS item cost derives to `$43.5258` and displays rounded to `$43.53`. This is a representative field-mapping check, not proof that current outlet cost always equals last case cost.

The signed-in product editor showed `-196 LEMON P/F 6% 330ML` with `Show Costs Including Tax` checked, `Case Cost` `$116.75`, and `Item Cost` `$3.89`. This confirms the UI's displayed tax toggle and labels for that product, but the page does not call the field `Last Case Cost`; the case quantity and the same product's API values were not captured in this UI observation. The `/reports/misc` landing page listed Inventory At Date, Slow Moving Stock, Stocktaked Products, Product Revision History, Inventory Movement, and Metcash MSC Sales Run. It did not list a standalone cost report. Public API documentation remains the evidence distinguishing current outlet `cost`, `lastCost`, and `averageCost`; the Inventory At Date page's live report labels and filters still need direct inspection.

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

## Barcode Reassignment Gate

The detailed classification contains 104 zero-stock stale-owner rows (52 per store). Every row's requested Shopfront product is `ACTIVE`, present in the current catalog, and declares the barcode. The existing POS owner is also `ACTIVE` and catalog-confirmed, has zero inventory, and no longer declares that barcode in its current source record. These rows are separate from the 202 source-side duplicate claims.

The POS importer explains why they remain conflicts: `retiredUnstockedBarcodeOwners` in `ShopfrontIntegrationController` permits migration only when the old owner's `shopfront_catalog_confirmed` flag is false and inventory is zero. `collectProductBarcodes` collects incoming barcode claims but does not remove an existing association simply because an active source product's current barcode list omits it. The safety test covers migration from an unconfirmed retired owner and refusal when inventory exists; it does not cover a still-active owner whose source record no longer claims a barcode.

This gap does not make a zero balance by itself sufficient authority to move the code. Any future automated policy must also prove from one complete current source snapshot that exactly one Shopfront product claims the barcode, that the old owner's current source record omits it, and that the requesting product is the unique current claimant. A permitted move must update only the outlet-scoped barcode association, record old/new product IDs and the evidence snapshot in an audit row, and leave inventory, product status, cost, and historical sales untouched. No code or live barcode change was made in this audit.

There was no active sync job at the time of the status query. The current source catalog observation is recent, while catalog job health is still partial/stale because the latest catalog job did not reach a clean terminal success.

## Strict Barcode Review (2026-11-18)

The newer run `#530` classification was filtered on unique current Shopfront claim, confirmed catalog owner, zero POS stock, no historical sale or purchase-line references, and resolved store mapping. This yields 90 rows (45 per store) representing 45 distinct barcodes. SKR and Demo requested-source and owner mappings agree. However, 22 existing owner products have multiple candidate barcodes and 26 target source products have multiple candidate barcodes. This remains a review-only set, not a single-row-per-product transfer authorization. No barcode was changed.

The detailed CSV and JSON summary are in crawler `.local/shopfront-barcode-strict-review-run530-2026-11-18.csv/.json`; the summary records the source file SHA-256 and candidate file SHA-256. This is a derived snapshot from run `#530`, not a live refresh. A follow-up unauthenticated request to the production Crawler `/api/pos/products/reconcile` returned 401 because no integration token is configured in this workstation's `.env`; do not treat this review as current production state until the authenticated endpoint can be read again.

At 2026-11-18 04:26 UTC, production `/healthz` returned 200 with source fingerprint `deee140faafd4140589c6076c04140a93ac116811ef2241ee7d00e44cca98624`, build time `2026-11-18T04:08:22Z`, and Git SHA `unknown`. The public health endpoint does not establish the latest sync job status. The last authenticated sync status remains the earlier readback below, so current sync freshness is unverified.

## Latest Sync Health Readback (2026-11-18 04:11 +08)

An additional authenticated read-only `GET /api/sync/status?store=skr` confirmed the crawler runtime fingerprint above and no active job. The newest daily sync was job `#845`, `partial` in `pos_import_incomplete`, finished at `2026-11-17T19:57:34Z` with 2 barcode-association conflicts across Demo and SKR. The most recent successful `daily_sync` was job `#825`, finished at `2026-11-17T13:38:32Z`; its age was 23,579 seconds against the 5,400-second stale threshold. Daily sync health therefore remains `partial` and stale despite the newer partial run.

The newest `catalog_snapshot` was job `#844`, `partial` at `pos_inventory:demo:10853/10853`, finished at `2026-11-17T19:26:24Z`. The last successful catalog snapshot was `#757`, finished at `2026-11-16T18:10:58Z`; its age was 93,633 seconds against the same 5,400-second threshold. Catalog sync freshness therefore remains `partial` and stale. A recent read-only view of source catalog observations must not be treated as evidence that the complete scheduled catalog import succeeded.

## Evidence and Remaining Work

- Ignored local candidate export: crawler `.local/cost-reconciliation-live-2026-11-18.csv` and `.json`.
- Ignored local barcode exports: crawler `.local/shopfront-barcode-conflicts-run523-2026-11-18.csv/.json`, `.local/shopfront-barcode-full-classification-run523-2026-11-18.csv/.json`, and the per-store owner readbacks. These contain the row-level evidence for all 408 conflicts.
- The latest authenticated sync-health readback is summarized above; live API status is point-in-time evidence, not a guarantee that subsequent scheduled runs succeed.
- Public Shopfront field definitions and the representative source-product GET are recorded above. They do not replace the pending visual check of `/reports/misc` and the product editor.
- Direct Shopfront UI `/reports/misc` and product cost management inspection remains pending.
- Define and test an explicit barcode reassignment policy before acting on any of the 52 zero-stock stale-owner rows per store. Source-duplicate claims and all owners with positive or negative stock remain protected; no barcode was moved in this audit.
- Reconcile any historical candidate only after Shopfront establishes a current authoritative cost, outlet, and case-size value. Use the existing explicit-ID cost-only path and verify every changed ID in both stores.
- No tests were run for this read-only audit. No online Shopfront calls or business writes were made; Shopfront/model cost was AUD 0.
