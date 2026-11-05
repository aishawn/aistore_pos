# 2026-11-05 Store Data Scope

## Scope

Read-only authenticated checks against `https://skr.orithos.com.au` and `https://demo.orithos.com.au` on runtime SHA `1e7f3a1e1076c9c56415ad7ff44487c2236f5f94`. The check established an Odoo session through `/api/odoo/session` before calling protected report routes. No Shopfront sync, Odoo write, audit repair, or broad replay was run.

## Observed source and report values

For Adelaide business day `2026-11-04`:

| Host | Odoo yesterday sales | Shopfront source gross sales | Source tax | Source orders | Source margin | Sync event |
|---|---:|---:|---:|---:|---:|---|
| SKR | `$3,760.72` | `$4,068.63` | `$334.36` | `144` | `24.013261%` | `completed` |
| demo | `$0.00` | `$4,068.63` | `$334.36` | `144` | `24.013261%` | `completed` |

Both hosts read the same verified Shopfront source key (`skr`) through the existing tenant mapping. The prior report response exposed source margin even for demo while the Odoo sales mismatch was not disclosed. The candidate change adds `sourceReconciliation=mismatch` and marks completeness `incomplete` when source gross/tax do not match the target Odoo period.

Before the candidate change, inventory reads also differed by page. SKR product inventory returned `2,263` products and total quantity `0`, while the dashboard returned `52,026` sellable units. Demo returned `12,986` products, `49,498` inventory quantity, and dashboard `49,504` sellable units. The candidate adds the bound warehouse to product record context and the bound stock location plus available POS product filter to dashboard stock aggregation.

## Local verification

- `shopfront-report-margin.test.ts`, `shopfront-source-margin.test.ts`, `inventory-report.test.ts`, and `report-cache.test.ts`: `25/25` passed.
- `npm run typecheck`: exit `0` on the candidate working tree.
- `git diff --check`: no whitespace errors.

## Limits

The candidate was not yet deployed when this record was written. Purchase and register reports were not treated as reconciled: their live checks require a valid grouping request and representative Odoo records. The source sync ledger still records completion events rather than a row-level source hash proof.
