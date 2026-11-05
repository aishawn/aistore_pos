# Shopfront Sync Validation

Updated: 2026-11-06. Candidate based on POS repository `efb1434f05c9b8faeaa171dcf940890f64371c0d`; no deployment or online parity acceptance is recorded in this file.

## Local candidate checks

| Check | Result | Scope / limit |
|---|---|---|
| Crawler full pytest suite | PASS, 129 tests | Local fixtures and mocked source/POS only |
| Shopfront Dashboard parser tests | PASS, 5 tests | Source profit/margin rules and inventory freshness only |
| Inventory page interruption/resume | PASS | Mocked first-page checkpoint, timeout, resumed second page, signed negative quantity, manifest promotion |
| Purchase mirror timeout status | PASS | Mocked daily job confirms `partial`, timeout reason, and warning phase |
| Odoo supply import fixture | PASS, 7 tests | Includes success receipt `item_count`; no deployed Odoo request |
| POS UI typecheck | BLOCKED | Worktree has no installed TypeScript compiler (`tsc` not recognized) |
| POS UI targeted lint | BLOCKED | Worktree has no installed ESLint executable |
| POS UI full unit suite | 177 pass, 2 fail | Both failures cannot import `redis`; no package dependencies are installed in this worktree |
| Project documentation checker | FAIL, 65 errors | This checkout is missing required project fact-library pages and referenced reporting sessions; not evidence of code behavior |
| Runtime/deployment and live Shopfront parity | NOT RUN | Candidate is unpushed; no live refresh or Shopfront write was performed |

## Acceptance still required

- Confirm POS and Odoo candidate commits are on their respective `main` branches and Dokploy runs those exact SHAs.
- Verify crawler `/healthz`, `/api/sync/status`, and `/api/sync/coverage`; a complete inventory manifest must match source product IDs and persisted product/outlet rows.
- Compare Shopfront source report counts and amounts with crawler rows for identical Adelaide business dates and all applicable report filters.
- Compare SKR dashboard yesterday sales, weighted profit percentage, and sellable units against Shopfront UI/API on the same data revision.
- Verify sales and purchasing by stable source ID, not only aggregate counts. Preserve negative inventory and explain any source rows the account cannot access.
- Confirm no mutation requests were issued during source comparison and that only intended business mirror domains were sent downstream.

## Live read-only baseline (2026-11-06)

Crawler `/healthz` returned `ok`. `/api/sync/coverage?store=skr` returned source-capture counts at `2026-11-05T23:29:46Z`: 11,030 product rows; 10,852 current catalog rows, of which 10,849 are ACTIVE and 3 NOT_ACTIVE; 178 product rows have no current catalog observation. Inventory has 10,852 product/outlet rows at one outlet, 5,374 negative rows, positive quantity sum 51,864, signed sum -255,329, and a complete 10,852-product manifest. Sales have 155,978 records and 305,666 lines, with zero missing line names. These counts confirm crawler coverage only; Shopfront page filter parity and POS/Odoo row parity remain unproven.

The live job endpoint confirms the historical defect: daily jobs 95 and 98 are `completed` while their `purchase_mirror_result.status` is `timeout`; customer jobs 96 and 99 failed because the Odoo response omitted `item_count`. These are the direct targets of the local reliability fixes. No live job was started and no business write was issued during this read.
