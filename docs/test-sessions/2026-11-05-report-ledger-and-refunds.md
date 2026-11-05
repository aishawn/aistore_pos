# Test Session: 2026-11-05 report ledger and refund metrics

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-05-report-ledger-and-refunds` |
| Date / timezone | 2026-11-05 to 2026-11-06 Asia/Shanghai |
| Source revision | `809ef6304a50de96f906d2c2c44a3f38552933ae` plus uncommitted reporting changes |
| Runtime identity | Not deployed / not verified |
| Environment | Local Windows source and unit tests; online source review already recorded in [report validation](../project/features/reporting/validation.md) |
| Database | Not applicable to local tests; online review used read-only requests |
| Business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `RPT-001` | `node --experimental-strip-types --test src/lib/sales-report-totals.test.ts src/lib/report-source-reconciliation.test.ts src/lib/sales-report-reconciliation.test.ts` in `pos-ui` | PASS: 10/10 | Test output from this session | Fixture/unit tests only; no Odoo data or provider calls |
| `RPT-001` | `npm run test:unit` in `pos-ui` | PASS: 182/182 | Final full frontend test run | First full run found an extra summary RPC (181/182); removed the unnecessary cross-ledger query and reran successfully |
| `RPT-001` | `npm run typecheck` in `pos-ui` using Node 24.22.1 | PASS | Exit code 0 on 2026-11-06 | Static type check; does not prove runtime behavior |
| `RPT-001` | Focused report-cache, refund totals, source-ledger classification and order/line reconciliation tests | PASS: 19/19 | Final targeted rerun | Includes the summary RPC budget regression |
| `DOC-001` | `python scripts/check-project-docs.py` | PASS | 66 Markdown files and local links/headings/evidence assertions verified | No runtime or business acceptance tested |
| `DOC-001` | `python -m unittest discover -s scripts/tests -p test_project_docs.py` | PASS: 12/12 | Documentation checker tests | Static documentation tests only |
| `RPT-001` | `git diff --check` | PASS | No whitespace errors | Git emitted line-ending normalization notices |
| `RPT-001` | Authenticated report UI, Odoo totals, CSV, print | NOT RUN | — | Runtime identity and authenticated report access not established for this candidate |
| `RPT-001` | SKR crawler read-only job/audit endpoints | INFO | Run 212, job 76 | 311 source sales fetched/processed; POS mirror 311; 3 Odoo batches acknowledged `mirrored=311`, native `imported=0`; no writes/replays |

## Summary

- Positive-total POS orders, negative-total refund orders, and net sales are exposed as separate values; net sales is positive order gross less the absolute negative-order total.
- Negative-total refund behavior and cent rounding passed focused fixture tests.
- Shopfront historical sales are stored as a separate `shopfront.sync.sale` mirror and are not turned into native `pos.order` records. Source-vs-native gross/GST is therefore `not_comparable`; this must not be presented as a missing-order mismatch. A completed sync event is returned separately as `sourceSyncEventsCoverPeriod`; it does not promote data completeness from `unverified` to `complete`.
- Odoo source review confirms the historical sales business-write handler deliberately returns `imported=0`, `mirrored=len(items)`, and `stock_writes=0` to avoid historical replay changing stock. The live crawler shows 155,976 saved sales overall, including 822 `INCOMPLETE`; row-level source ID parity against the Odoo mirror remains unverified.
- The same read-only run listing showed customer sync runs 77 and 73 rejected because the Odoo customer response omitted `item_count`; this separate response-contract defect is not changed here.
- Focused tests passed 19/19, the full frontend suite passed 182/182, and the exact-diff Node 24 typecheck passed. Deployment, browser interaction, same-ledger source reconciliation, CSV/print parity, refunds in mixed-sign orders, GST details, cross-day boundaries, and DST behavior remain unverified online.
- No business data was written.

## Follow-up

1. Deploy the candidate through the configured `main` pipeline and record the exact runtime SHA.
2. Verify report UI and CSV/print against the same native Odoo order scope in authenticated read-only mode.
3. Independently verify Shopfront mirror completeness by source IDs and lines; do not compare its aggregate to native POS totals.
4. Add representative mixed-order refund, GST, cross-day, and DST cases to the report regression set.
