# Shopfront Inventory Summary Recovery

Date: 2026-11-08
Environment: Local POS UI checks; prior authenticated SKR read-only UI; Odoo database `aipos_uat`, company 5, location `UATPI/Stock`
Source/runtime SHA: First candidate `b09500eaa4e8aeb91f18af09d9b59c567dd934c5` deployed to SKR and Demo; always-visible summary follow-up pending
Business data writes: 0

## Findings

- Inventory rows already showed Shopfront stock, case cost, price, and category. Example `-196 LEMON P/F 6% 330ML`: 128 units, `$116.75` case cost / 30, `$3.89` per item, and `$8.99` shelf price.
- The independent crawler Reporting API request for the summary failed temporarily while the Odoo mirror-backed rows remained available.
- Read-only `aipos_uat` audit: 10,849 active Shopfront products, 10,852 inventory rows, 50,914 positive source units; 0 missing canonical products and 0 quantity mismatches. Seven positive source costs remain zero in Odoo `standard_price`; no cost write was made.

## Candidate

Inventory coverage is calculated in the same Odoo mirror-backed snapshot as the report rows. The summary uses that coverage instead of making another Reporting API request and keeps Shopfront values identified separately from Odoo balances. When cost coverage is unavailable because of permissions, the UI omits the cost counts instead of displaying a misleading zero.

The first candidate's live page check found that coverage was still hidden inside a collapsed history section. The follow-up displays coverage continuously. Live SKR rows showed GRT NTH ORG with 465 units and `$50.02` / pack 24, and `-196 LEMON P/F 6% 330ML` with 128 units and `$116.75` / pack 30.

## Checks

- `npm run typecheck`: PASS for both candidates.
- Targeted ESLint: first candidate 0 errors / 9 existing warnings; visibility follow-up `ShopfrontSourceSections.tsx` 0 errors.
- `npm run test:unit -- src/lib/shopfront-catalogue.test.ts src/lib/inventory-report.test.ts`: PASS, 202 tests (the package script runs the full UI unit suite).
- `git diff --check`: PASS.
- Project documentation checker: FAIL, 66 pre-existing missing-file/link errors in this checkout.
- First candidate runtime confirmed on SKR and Demo. Follow-up commit/runtime and always-visible summary acceptance: pending.
- No crawler job, Shopfront write, or Odoo business-data write was issued.

## Limits

Shopfront OAuth still lacks report scopes, so this change does not establish native Shopfront Sales/Purchase report parity. It also does not establish the tax basis for source cost or resolve the seven Odoo zero-cost records.
