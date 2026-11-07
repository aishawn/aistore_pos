# SKR Shopfront Catalogue Reconciliation

Date: 2026-11-07

## Scope

Explain the difference between the Shopfront product count and the Odoo catalogue row count, verify the Shopfront stock total, make source coverage visible, and retire the legacy `/purchases?state=purchase` receipt link.

## Read-only data audit

Database: `aipos_uat`; store: `skr`; Odoo company: 5; stock location: `UATPI/Stock`.

- Shopfront mirror: 10,849 ACTIVE products, 10,852 inventory rows, 51,512 positive units, and 5,373 negative inventory rows.
- Latest inventory snapshot: `2026-11-06T16:22:09.877859`.
- 11,005 unique source/product mappings had exact stock agreement (0 mismatches). There are 25 ambiguous ACTIVE references and 2 ACTIVE products without a canonical Odoo template.
- 281 mapped products have positive Shopfront cost while Odoo recorded cost is zero. Source costs were not written to Odoo because tax and unit basis are not verified.
- The 13,292 value is an Odoo product variant count, not a Shopfront source product count. The positive stock sum is a Shopfront snapshot measure; 50,992 is not the current audited positive-unit total.

### Latest read-only recheck

- Fresh read-only recheck on 2026-11-07 used `aipos_uat`, SKR company 5, Odoo warehouse 5 (`Orithos UAT Business Two WH`) and its stock location 48 (`UATPI/Stock`). This matches the inventory API's `sale_ok = true`, company `[5]`, warehouse `5` scope.
- Odoo returned 13,292 saleable variants, 51,229 positive available units, and 5,375 negative-stock variants. All positive balances use the `Units` UOM. The screenshot's 13,292 count is correct for this scope; its 50,992 quantity is stale and is 237 units below this fresh read.
- Shopfront's Odoo mirror has 11,032 product rows, including 10,849 ACTIVE products. The ACTIVE products have 10,849 inventory rows, 51,512 positive units, and 5,373 negative rows; the latest source snapshot is `2026-11-06T18:13:31.444091` (Odoo datetime; timezone suffix is not stored). This source snapshot is older than the Odoo read.
- The 10,849 ACTIVE source products and 13,292 Odoo saleable variants are different record scopes; the 2,443-row difference does not mean Shopfront products are missing. Shopfront's 51,512 source units and Odoo's 51,229 available units are also separate ledgers, currently 283 units apart. No stock or cost values were written. Aggregate totals do not establish row-level reconciliation.
- Earlier audit notes showing 13,364 / 51,318 do not match this exact UI-domain query; the earlier query scope was not recorded in enough detail to explain the difference. They are superseded for the current UI scope by this explicit route-equivalent read. The public runtime on SKR reports frontend and backend SHA `a74f650c2dd25434d460030babb96a63e0e4698b`, matching `main` at the time of this read.

## Candidate changes

- Product catalogue footer now labels Odoo variants separately from Shopfront active products, mapping coverage, inventory coverage, and positive source units.
- Shared Odoo product templates are included in the company-scoped Shopfront mapping queries.
- Failed source enrichment clears partial Shopfront values and labels source cost/price unavailable; it does not substitute Odoo price for a missing Shopfront price.
- The existing PurchasingWorkspace handler redirects legacy `/purchases?state=purchase` requests to `/purchases`.
- Inventory totals are explicitly labeled as Odoo saleable variants and positive available units. The legacy receipt URL redirects even when its query parameter is repeated.
- The authenticated SKR login probe returned 401, so the current live rendered purchase page was not rechecked in this session. Anonymous access to the legacy URL is intercepted by the login guard; current source/runtime contains the server redirect, and no business writes were issued.

## Verification

- `node --experimental-strip-types --test src/lib/shopfront-catalogue.test.ts`: PASS, 4/4.
- `npm run typecheck`: PASS.
- Focused ESLint: PASS, 0 errors and 9 existing effect warnings.
- `git diff --check`: PASS.
- Read-only audit issued no business-data writes.
- First deployment `5ba3b317d0bbadbc9e37ef8b0e555aab978f6244`: Dokploy status `done`; frontend and backend runtime SHAs matched. The legacy purchases URL redirected to `/purchases`, which displayed the normal Purchase Orders view. Products showed 10,849 active source products and 51,512 source positive units. Initial row inspection exposed a source-enrichment failure when optional performance data was unavailable.
- Follow-up fix isolates 30-day performance queries from core Shopfront product and inventory enrichment. Local typecheck, focused ESLint, helper tests 4/4, and diff check passed again. Its deployment is pending.
- Dokploy `main` auto-deploy is enabled. Pre-first-push public runtime SHA was `7d824a2665c616d7463fec72cb3dd8f7a7d9afad`.
