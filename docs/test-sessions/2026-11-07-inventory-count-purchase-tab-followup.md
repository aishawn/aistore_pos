# Inventory Count and Purchase Tab Follow-up

- Date: 2026-11-07
- Base: `origin/main` at `f4f3cc21947b6d936532adc7b1466d9023872c69`
- Scope: remove the legacy receipt tab on `/purchases?state=purchase`; make inventory count and stock-total scopes explicit.

## Findings

- Screenshot values: 13,292 Odoo variants and 50,992 positive units. The Odoo `All products` inventory domain is `sale_ok = true` under the bound company/warehouse scope; it includes products hidden from POS. The count is not the Shopfront ACTIVE catalog count.
- Latest recorded read-only Shopfront audit: 10,849 ACTIVE products and 51,512 positive source units. Its snapshot is source data with its own timestamp; 50,992 is a historical Odoo snapshot total and must not be presented as the current Shopfront unit total.
- The read-only reconciliation report recorded 11,005 source/product quantity comparisons and zero mismatches. Aggregate counts still do not establish one-to-one product correspondence.

## Changes

- The server page redirects `/purchases?state=purchase` to `/purchases` before hydrating the purchasing workspace.
- The inventory footer says `Odoo saleable variants`; the Shopfront snapshot panel explains that source ACTIVE counts and Odoo saleable variants have different scopes and keeps source and snapshot context visible.
- Added domain tests for the default saleable inventory view and hidden-from-POS filter.

## Verification

- `node --experimental-strip-types --test src/lib/product-catalogue.test.ts src/lib/inventory-report.test.ts`: PASS, 9/9 (Node `22.22.2`; below the repository's declared Node 24 engine).
- `npm run typecheck`: BLOCKED because this clean worktree has no local `tsc` executable / installed frontend dependencies.
- `python scripts/check-project-docs.py`: FAIL, 65 existing missing-file/link/evidence errors; no new errors were reported for the added session or its index link.
- `git diff --check`: PASS.
- Deployment SHA, live runtime identity, and authenticated browser navigation: PENDING.
- Business-data writes: 0.
