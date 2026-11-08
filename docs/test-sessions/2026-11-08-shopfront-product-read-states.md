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
