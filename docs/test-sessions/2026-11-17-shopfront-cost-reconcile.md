# Shopfront Cost Reconciliation

Date: 2026-11-17 (Asia/Shanghai)

POS source/runtime SHA: `3d08ca5a122c986241c8999f1b7219926f8c5166` on SKR and Demo.

Crawler runtime source fingerprint: `37652a4ef59e1aa4fee1caa40db9b80694574b58c142cbf996af06b94a99e7c3`; runtime reports Git SHA `unknown`, build time `2026-11-17T00:43:07.978322+00:00`.

## Scope

Production reads used the crawler's authenticated product, synchronization status, and product-reconciliation APIs plus the POS native-data API. They compared crawler source IDs and fields with both mapped POS outlets. No Shopfront write, inventory write, price write, or sales-ledger write was made. The owner-authorized product-cost operation applied only to 179 explicitly enumerated source IDs in each target.

## Findings

- Crawler had 11,035 product rows and 10,853 current-catalog observations: 10,850 ACTIVE, 3 NOT_ACTIVE. All 10,853 current-catalog costs were available; 855 were explicit zero values.
- 179 legacy cost candidates were absent from a confirmed current catalog observation. Every candidate had a historical sales reference; 80 also had purchase-order references. Their source IDs matched between SKR and Demo.
- All 179 SKR product rows were POS NOT_ACTIVE. Demo had 178 NOT_ACTIVE and one ACTIVE. The ACTIVE Demo product remained ACTIVE after its unconfirmed cost was cleared.
- Current-catalog comparison had zero mismatch for cost, case quantity, retail tax name, cost tax name, source status, and Shopfront source-update timestamp. Name mismatches remained: 114 SKR and 158 Demo. Three fields were unavailable.
- No current full-catalog snapshot could be verified by the source-ID manifest. Sync status classified the latest catalog snapshot as `partial` and stale; catalog parity is not accepted as complete.

## Change And Verification

- Added `/api/integrations/shopfront/products:clear-unverified-costs`. It validates unique explicit source IDs, exact expected current cost, one mapped live product per ID in the requested outlet, and `shopfront_catalog_confirmed != true`. It writes audit rows to `shopfront_product_cost_audit` in the same transaction and only updates `product.cost` and `product.shopfront_catalog_confirmed`.
- Java 21 command `mvn -B -Dtest=ShopfrontIntegrationControllerTest test`: PASS, 64 tests, 0 failures/errors. New tests cover the narrow product update/audit and rejection of catalog-confirmed products. `git diff --check`: PASS.
- Commit `3d08ca5a122c986241c8999f1b7219926f8c5166` was pushed to `main`; Dokploy status was `done`; both store version endpoints reported this exact frontend/backend SHA.
- POS returned HTTP 200 and 179 updates for each target. The two readbacks found all 358 costs null and catalog confirmation flags false. The audit table held 179 distinct IDs per store with the expected reason and null `new_cost`. Product status, case quantity, and tax fields remained unchanged. Historical sales rows changed: 0.

## Monitoring And Limits

Crawler `/healthz` and `/api/sync/status` returned 200. Runtime source fingerprint matched the local crawler source, while `git_sha` remained unknown. The status API reported terminal status, last-success age, stale threshold, partial state, and per-job freshness. The latest catalog snapshot was `partial`; its prior successful snapshot age exceeded the 90-minute threshold. `complete_product_catalog_snapshot.complete` was false.

Shopfront UI and `/reports/misc` were not accessed because the owner deferred login. Direct Shopfront UI validation is still required to confirm the current outlet-cost display, tax basis, and relationship to `Last Case Cost`. A full catalog snapshot and resolution of product-name/unavailable-field differences remain open.

Detailed per-product read and write exports remain in the ignored `shopfront-crawler/.local/` directory and are not committed because they contain business identifiers and costs.
