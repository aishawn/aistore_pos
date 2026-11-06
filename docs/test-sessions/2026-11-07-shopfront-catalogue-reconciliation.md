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

## Candidate changes

- Product catalogue footer now labels Odoo variants separately from Shopfront active products, mapping coverage, inventory coverage, and positive source units.
- Shared Odoo product templates are included in the company-scoped Shopfront mapping queries.
- Failed source enrichment clears partial Shopfront values and labels source cost/price unavailable; it does not substitute Odoo price for a missing Shopfront price.
- The existing PurchasingWorkspace handler redirects legacy `/purchases?state=purchase` requests to `/purchases`.

## Verification

- `node --experimental-strip-types --test src/lib/shopfront-catalogue.test.ts`: PASS, 4/4.
- `npm run typecheck`: PASS.
- Focused ESLint: PASS, 0 errors and 9 existing effect warnings.
- `git diff --check`: PASS.
- Read-only audit issued no business-data writes.
- Deployment: pending push and Dokploy build. Dokploy `main` auto-deploy is enabled; pre-push public runtime SHA was `7d824a2665c616d7463fec72cb3dd8f7a7d9afad`.
