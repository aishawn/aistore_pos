# Shopfront Product Read States

- Date: 2026-11-08
- Candidate source SHA: `7afad8245a17a2d087f88c089262a03dfbe64620` plus the candidate changes recorded in this session
- Runtime SHA: not deployed
- Database scope: none for local checks
- Read/write scope: local source checks only; no Odoo or Shopfront business-data writes

## Change

The Odoo product catalogue now exposes Shopfront cost and inventory query outcomes independently. Real zero values remain valid; missing rows, unavailable reads, and restricted cost access are labeled distinctly. Desktop and mobile catalogue rows use the same source-state rendering.

## Verification

- Focused `shopfront-catalogue.test.ts`: PASS, 5/5. Run with Node `v22.22.2` and `--experimental-strip-types`.
- Targeted ESLint: PASS, 0 errors / 9 existing `react-hooks/set-state-in-effect` warnings.
- POS UI typecheck: PASS (completed with exit code 0); production build: PASS.
- `git diff --check`: PASS before final documentation edits.
- Project fact-library checker: FAIL, 66 missing-file/link errors in this checkout; most of the project fact library is absent and ignored by `/docs/`.
- Deployment and authenticated page verification: NOT RUN

## Limits

This UI/API change does not write costs into Odoo `standard_price` or alter Odoo stock quantities. The user selected the conversion `Shopfront box cost / case quantity` for Odoo `standard_price`; the Odoo sync guard still requires reviewed evidence and a net-of-recoverable-tax unit cost. A box conversion alone does not establish tax basis, so no cost write is authorized by this candidate until the source tax treatment is verified and represented in the review evidence.

## Deployed parity follow-up (2026-11-08)

- POS `main` `fce60e3cef10322b10c578032eb9d2d16c0542b1` and Odoo `main` `63c50a0bb65d6a06f6622928506857abc74eec37` were subsequently deployed. Odoo identity fixes `077b740` and `63c50a0` permit unique SKU resolution for legacy records while preserving conflict checks.
- Durable crawler job #29 completed with 11,030 products, 10,852 inventory rows, and no unmatched inventory rows.
- Read-only reconciliation against `aipos_uat`, company 5, `UATPI/Stock`: all 10,849 ACTIVE Shopfront Products-page records matched canonical products and stock quantities (0 missing, 0 quantity differences). Valid case-size records also had 0 unit-cost differences after dividing Shopfront case cost by case quantity.
- Authenticated SKR `/products` showed the merged product fields and 30-day performance. The `-196 LEMON P/F 6% 330ML` example showed `$116.75` case cost / 30, `$3.89` per item, 128 units, `$8.99` price, and 105 units sold in 30 days.
- Source product data carries separate retail `taxRate` and purchase `costTaxRate`; the captured source query does not expose `costEx` or a cost-inclusive flag. Thus tax fields are preserved separately, but a tax-basis interpretation cannot be claimed from the rate labels alone. Shopfront reports' profit remains a source value and is not reclassified as an Odoo-accounting figure.
- This closes the Products/inventory/cost-value comparison for the audited scope; it does not claim complete 1:1 parity for all Shopfront reports, purchase workflows, or settings. No additional business-data write occurred in this verification.
