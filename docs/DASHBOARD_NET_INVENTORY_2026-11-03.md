# SKR dashboard net inventory display

Authenticated live check at 2026-11-03 12:16 UTC confirmed `/dashboard` displayed Total inventory as a dash. The reporting API returned `inventoryUnits=41731`, `inventoryStatus=negative_stock`: the aggregation included only positive quants, and the UI hid the number whenever any negative stock existed.

Correction: sum signed on-hand across the current company's internal locations, preserve fractional quantities, and show the recorded net quantity with “Net on hand · Negative stock to review”. Mixed units, unavailable data and nonfinite values remain a dash. Keep the three metrics in one row and preserve `/stock/list` navigation. Advance the report snapshot schema to prevent reuse of the positive-only total. No Odoo business writes or local application build.

Independent Odoo RPC at 2026-11-03 12:19 UTC: company 5, shared `aipos_uat`, all internal locations, 10,968 quants, one unit of measure (Units), signed on-hand **-1,334,367**, reserved **3**. This reconciles with the preceding stock repair. The negative number is still recorded inventory requiring reconciliation, not a verified physical stocktake.

Local checks: 10 dashboard/cost regression tests pass, including a new company/internal-location scoped regression that models positive-only filtering and verifies signed fractional totals. TypeScript and targeted ESLint pass. Actual component rendering in Edge at 320/390/768/1024/1440px shows the negative total and warning in one row, with no horizontal overflow, visible keyboard focus and correct detail links; zero/normal/unavailable/stale/dark/loading states also pass. Deployment and live acceptance are recorded separately after push.
