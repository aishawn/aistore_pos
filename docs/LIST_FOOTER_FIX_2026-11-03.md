# List loading and product footer repair — 2026-11-03

## Scope

- Products and Inventory report share a bounded flex layout: the results scroll area ends above an opaque totals footer that occupies the page bottom. Removed the old 96px table spacer. Load more is available directly in the footer; automatic loading still observes the end of the results.
- Purchase orders, customers and suppliers append batches, expose Load more, pause automatic loading on errors, and ignore obsolete responses. Request offsets derive from loaded row count, avoiding repeated-trigger skips. Refresh starts again at offset zero.
- Sales History retains the latest daily summary / sales lines views. Daily summary appends by date with a synchronous request guard, stable retry offset, query reset and a sentinel inside its actual scroll area.

## Verification and limits

Result: 60/60 browser checks PASS at 390 / 1024 / 1440px, browser errors 0, live writes 0. TypeScript and targeted ESLint PASS. Sales filters and refresh also reset appended days.

Local intercepted browser fixture: `scripts/pilot-list-footer-ui-local.cjs`; results in `UAT_LIST_FOOTER_LOCAL_2026-11-03.json`. Products / Inventory at 390, 1024 and 1440px cover the footer edge, explicit Load more, batches through the final row, completion status and document overflow. Daily sales and purchase orders cover observer placement and automatic append. Customer/supplier changes receive static review and TypeScript / targeted lint checks; no live acceptance is inferred.

No local production build or Maven run. No real Odoo writes. Deployment and runtime SHA must be verified independently; pushing source does not confirm deployment. Unrelated pricing, crawler and report-cache working files are excluded from this fix.
