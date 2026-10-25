# Stock workspace implementation — 2026-10-25

## Implemented locally

- Stock navigation has Products, Purchasing and Suppliers. Price Lists stays available under Customers.
- Products keeps the list and filters in place while Manage Categories and Stocktake open as URL-backed dialogs. CSV import/export is under More. Stocktake can expand to the full page and stores per-store, employee and location drafts in browser storage.
- Purchasing embeds Orders, Replenishment and Supplier Invoices. Transfers remain available from More. Replenishment links to the created draft order; purchase confirmation and receipt retain their existing permission checks and flows.
- Legacy classifications, replenishment, invoice-list and stocktake routes redirect to their new destinations. Invoice detail, scan and transfer deep links remain supported.
- Odoo categories use company ownership. Existing categories with no company remain shared and read-only. Product/category assignment uses the same visible category scope. Category writes are gated by `ODOO_CATEGORY_WRITE_ENABLED`, which defaults off.

## Local verification

- TypeScript `tsc --noEmit`: passed. Targeted ESLint: passed with no errors (three pre-existing hook dependency warnings in InvoiceScanDetailPage).
- Node unit tests: 6/6 passed.
- Category route fixture: 13/13 passed. Stock workspace browser fixture: 38/38 passed at 390, 768 and 1440 pixel viewports; all API traffic was intercepted and live business writes were zero.
- Evidence: `UAT_ODOO_CATEGORIES_ROUTE_LOCAL_2026-10-25.json` and `UAT_STOCK_WORKSPACE_LOCAL_2026-10-25.json`.
- `git diff --check` passed with existing Windows line-ending warnings. No application build was run.

## Rollout and acceptance still required

1. Upgrade `orithos_au_retail` (the current dirty addon manifest is `19.0.1.2.0`) in an approved isolated Odoo database/company. Run the addon post-install tests there and verify shared-category visibility, company ownership, reference protections and cross-company rejection.
2. Keep category writes disabled until that upgrade and isolation test pass. Enable `ODOO_CATEGORY_WRITE_ENABLED=true` only in the isolated test deployment for category write acceptance.
3. Run real purchase, invoice and stocktake workflows only in the approved isolated environment. Fixture tests do not verify Odoo behavior or business acceptance.
4. Curate and freeze a candidate from the shared dirty worktrees before commit/deployment. Existing unrelated changes occupy the same files and repositories. No commit, push, deployment or live Odoo write was performed for this implementation.

The POS worktree has unrelated Java changes. Before pushing a candidate containing any `pos-api/` changes, run the required remote Java 21 `mvn -B clean verify` against that exact candidate SHA.
