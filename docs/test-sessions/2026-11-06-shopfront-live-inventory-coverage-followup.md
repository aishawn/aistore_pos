# Shopfront Live Inventory Coverage Follow-up

- Date: 2026-11-06
- Source repository: POS `main`, base `cf2a198c708213cb60e183e1fd2ce0c1812cfb42`.
- Scope: read-only Shopfront crawler coverage and POS staging source-ID reconciliation; inventory report source labels.
- Shopfront crawler coverage: 11,030 stored product rows; 10,852 seen in current catalog; 10,849 Active and 3 `NOT_ACTIVE`; 10,852 inventory rows; manifest complete with exact product-ID coverage; 51,526 positive quantity; 5,373 negative rows; snapshot timestamp `2026-11-05T19:21:09.980386`.
- Latest daily run 144 is `partial` only because its purchase mirror timed out; payload states `full_inventory_snapshot=false`. It does not refresh the inventory snapshot. The snapshot is stale for current stock comparison.
- POS primary and mirror staging each report 11,030 products and 10,852 inventory rows. `/api/pos/products/reconcile` reports zero crawler-missing and zero POS-only IDs. This verifies staging catalog parity only; it is not formal Odoo inventory reconciliation.
- Supplied screenshot values: 10,849 Shopfront Active products; 13,292 Odoo saleable variants; 50,992 Odoo positive units; 5,379 negative Odoo variants. Shopfront product catalog and Odoo product variants have different source scopes. The latest Shopfront sum is 534 above the screenshot Odoo positive-unit sum, but snapshot times differ and the Shopfront snapshot is stale, so present-day stock correctness remains NOT VERIFIED.
- Changes in this follow-up add source active count, Odoo variant count, Shopfront positive units, store-local snapshot time, negative-row count, and a stale-snapshot warning for snapshots older than 24 hours to the Shopfront inventory section of the Odoo inventory report.
- `node --experimental-strip-types --test src/lib/inventory-report.test.ts`: PASS, 7/7. `git diff --check`: PASS. `npm run typecheck`: could not start because `tsc` is not installed in this clean worktree. No local app build.
- Business writes: 0. No Shopfront sync/import was triggered.
- Deployment and authenticated UI check: pending commit/push and Dokploy auto-deploy.
