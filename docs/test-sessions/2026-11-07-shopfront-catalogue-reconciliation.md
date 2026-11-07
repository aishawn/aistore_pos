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

- Shopfront still reports 10,849 ACTIVE products. Its complete inventory mirror has 10,852 rows and 51,512 positive units; the latest snapshot is `2026-11-06T18:13:31Z`. Negative quantities are tracked separately.
- Odoo reports 13,364 saleable variants and 51,318 positive units for company 5 / `UATPI/Stock` in the latest recheck. These are Odoo balances, not the Shopfront mirror totals. The 13,292 / 50,992 values in the supplied screenshot are the earlier Odoo inventory view, retrieved on 2026-11-06 at 4:48 pm; they are not the current recheck.
- The catalog totals are not directly comparable: Shopfront counts ACTIVE source products, while Odoo counts saleable variants, including products outside the mapped Shopfront set and legacy/duplicate variants. Of 11,004 uniquely comparable source mappings, 76 have stock differences with 196 units of total absolute variance; 26 references are ambiguous and 2 active source products have no mapping. No stock or cost values were written.
- Odoo's available-unit total excludes negative balances and is only additive when all rows use a common unit. The Shopfront positive-unit total is a separate source snapshot. Neither number should be read as a reconciled cross-system total.

## Candidate changes

- Product catalogue footer now labels Odoo variants separately from Shopfront active products, mapping coverage, inventory coverage, and positive source units.
- Shared Odoo product templates are included in the company-scoped Shopfront mapping queries.
- Failed source enrichment clears partial Shopfront values and labels source cost/price unavailable; it does not substitute Odoo price for a missing Shopfront price.
- The existing PurchasingWorkspace handler redirects legacy `/purchases?state=purchase` requests to `/purchases`.
- Inventory totals are explicitly labeled as Odoo saleable variants and positive available units. The legacy receipt URL redirects even when its query parameter is repeated.

## Verification

- `node --experimental-strip-types --test src/lib/shopfront-catalogue.test.ts`: PASS, 4/4.
- `npm run typecheck`: PASS.
- Focused ESLint: PASS, 0 errors and 9 existing effect warnings.
- `git diff --check`: PASS.
- Read-only audit issued no business-data writes.
- First deployment `5ba3b317d0bbadbc9e37ef8b0e555aab978f6244`: Dokploy status `done`; frontend and backend runtime SHAs matched. The legacy purchases URL redirected to `/purchases`, which displayed the normal Purchase Orders view. Products showed 10,849 active source products and 51,512 source positive units. Initial row inspection exposed a source-enrichment failure when optional performance data was unavailable.
- Follow-up fix isolates 30-day performance queries from core Shopfront product and inventory enrichment. Local typecheck, focused ESLint, helper tests 4/4, and diff check passed again. Its deployment is pending.
- Dokploy `main` auto-deploy is enabled. Pre-first-push public runtime SHA was `7d824a2665c616d7463fec72cb3dd8f7a7d9afad`.
