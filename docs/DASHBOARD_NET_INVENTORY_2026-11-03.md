# SKR dashboard net inventory display

Authenticated live check at 2026-11-03 12:16 UTC confirmed `/dashboard` displayed Total inventory as a dash. The reporting API returned `inventoryUnits=41731`, `inventoryStatus=negative_stock`: the aggregation included only positive quants, and the UI hid the number whenever any negative stock existed.

Correction: sum signed on-hand across the current company's internal locations, preserve fractional quantities, and show the recorded net quantity with “Net on hand · Negative stock to review”. Mixed units, unavailable data and nonfinite values remain a dash. Keep the three metrics in one row and preserve `/stock/list` navigation. Advance the report snapshot schema to prevent reuse of the positive-only total. No Odoo business writes or local application build.

Independent Odoo RPC at 2026-11-03 12:19 UTC: company 5, shared `aipos_uat`, all internal locations, 10,968 quants, one unit of measure (Units), signed on-hand **-1,334,367**, reserved **3**. This reconciles with the preceding stock repair. The negative number is still recorded inventory requiring reconciliation, not a verified physical stocktake.

Local checks: 10 dashboard/cost regression tests pass, including a new company/internal-location scoped regression that models positive-only filtering and verifies signed fractional totals. TypeScript and targeted ESLint pass. Actual component rendering in Edge at 320/390/768/1024/1440px shows the negative total and warning in one row, with no horizontal overflow, visible keyboard focus and correct detail links; zero/normal/unavailable/stale/dark/loading states also pass. Deployment and live acceptance are recorded separately after push.

## Deployed acceptance

Behavior commit `a9bc0f8731210606613db63f7f23697e8af4f680` pushed to main. Dokploy deployment `6Nngl7Ietw3jrYg-dWBY5` completed successfully; frontend image export and remote backend Maven verification succeeded (510 tests, zero failures/errors/skips). No Java changes were made in this task. Public version endpoint confirmed both frontend and backend at that exact SHA during acceptance.

Authenticated SKR acceptance at 2026-11-03 12:25:59 UTC: reporting summary HTTP 200, inventoryUnits=-1334367, inventoryAvailable=true, inventoryStatus=negative_stock, negativeStockProducts=8265. The visible card showed -1,334,367 and the review explanation. At 1440/768/390/320px, all three metrics share one row, text fits and the page has no horizontal overflow. Refresh preserves the number, both refresh and inventory-link keyboard focus are visible, and clicking Total inventory opens `/stock/list`. Read-only verification; no Odoo business writes. A separate concurrent sales-filter deployment subsequently started; this acceptance refers specifically to the verified behavior SHA above.

The additional report cache suite passed 8/8 (18 targeted tests total). Evidence: [live checks](UAT_DASHBOARD_NET_INVENTORY_2026-11-03.json), [desktop](screenshots/dashboard-net-inventory-2026-11-03/desktop.png), [mobile](screenshots/dashboard-net-inventory-2026-11-03/mobile.png). Remaining negative records still require business reconciliation; UI accuracy does not certify physical inventory accuracy.
