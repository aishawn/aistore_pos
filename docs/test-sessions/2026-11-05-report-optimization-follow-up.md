# Reporting optimization follow-up

Date: 2026-11-05
Suite: `RPT-001`
Environment: local source and deterministic unit fixtures; no Odoo reads or business writes
Base source SHA: `cf022f55a6a9a793c78941597e269ca610fd467a`
Candidate source SHA: `71a715a7e970a0abaf0d8c2c7f18a3a2fcb4fa62` (report implementation); main app-source SHA at the latest runtime check `6121dba2b99fea9689b1082d7a83e496fa3b6e83`
Runtime SHA: SKR and Demo frontend/backend `cf022f55a6a9a793c78941597e269ca610fd467a`; report changes are not deployed
Model/prompt/config/snapshot versions: not applicable

## Scope

- Restore the register-closure table from fetched rows and render selectable expected, counted, and difference columns.
- Make full-result printing use the same selected columns as the on-screen table.
- Make Inventory Clear filters clear zero/negative stock status as well as search/category/view filters, including when stock status is the only active filter.
- Remove duplicate synchronization of inventory stock status from the URL.
- Apply the authenticated store timezone to purchase day and month grouping.
- Review report entry labels, date/group choices, metadata, export scope, and documented metric boundaries.

## Results

| Check | Result | Evidence / limitation |
|---|---|---|
| Focused unit suites | PASS, 39/39 | Report date periods, Adelaide DST boundaries, register cash summary, inventory totals/sorting/snapshots, report cache and Odoo scoping, period presets, and sales reconciliation helpers. |
| Full frontend unit suite | PASS, 175/175 | `npm run test:unit`, Node 24.22.1; all library suites passed. |
| Full frontend TypeScript | PASS ON PRE-FAST-FORWARD CANDIDATE | `npm run typecheck`, Node 24.22.1, exit code 0. A rerun after `main` advanced to `cf022f55` was interrupted after prolonged silence; report source files were unchanged. |
| Targeted ESLint | NOT RUN (FINAL RERUN INTERRUPTED) | The prior candidate run reported 0 errors / 16 React effect warnings. The final rerun produced no diagnostics and was interrupted after more than two minutes; rerun before the next code change or release. |
| Project documentation checker | PASS | 66 Markdown files; verifies local project documentation links and required structure only. |
| `git diff --check` | PASS | No whitespace errors. |
| Browser interaction / print / downloaded CSV parity | NOT RUN | Requires the candidate to be deployed or a configured local authenticated UI. |
| Odoo order, purchase, closure, and inventory source reconciliation | NOT RUN | No service calls were made in this session. |
| Public runtime version endpoints | PASS (identity check only) | SKR and Demo both returned frontend/backend SHA `cf022f55a6a9a793c78941597e269ca610fd467a`, built 2026-11-05 12:50 UTC; this predates the report implementation. |
| Dokploy deploy webhook | BLOCKED | Supplied webhook returned `Branch Not Match`; no retry. Dokploy Source/Git repository, branch/ref, repository root, and Compose file remain unverified. |
| Production business writes | 0 | No sales, receipts, stock, register, or other Odoo mutations. |

## Findings and limits

- A code review found that Register Closures loaded rows and showed a count footer but rendered no records. The candidate now renders the records and sends visible-column selection to the full print request. This is source-level evidence only; deployed browser behavior is not yet established.
- The Inventory stock filter was URL-backed but Clear filters did not clear it, and the clear action was hidden when it was the only active filter. Both paths are corrected in source.
- Overview net sales after refunds and Sales report positive-order gross / line totals have different definitions. The interface and design documentation disclose those definitions; they are not claimed to reconcile as identical metrics.
- Shopfront sync-event coverage does not prove row-level completeness in Odoo. Odoo-source reconciliation remains a required live read-only check.
- All test samples are deterministic helpers/fixtures. No live provider/model call, Odoo read, deployment, or runtime claim is included.
