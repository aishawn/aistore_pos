# Authenticated AI read-only rerun (`7617e3ce`, 2026-11-05)

## Scope and safety

The existing read-only verification harness logged in separately to SKR and Demo, explicitly established an Odoo session, queried yesterday/last-week reports, asked exact-date and weekly sales questions, asked the replenishment question, and read the replenishment/forecast API. Both runs reported `writeRequests=[]` and `pageErrors=[]`. No RFQ or purchase order was created. Raw evidence is ignored local data under `.local/ai-eval/`.

## Runtime and access

| Store | POS/Odoo login | Runtime SHA | Runtime build (UTC) |
|---|---|---|---|
| SKR | PASS / PASS | `7617e3ce9d2548096c5f3db28631bfd98738762e` | `2026-11-05T14:34:57Z` |
| Demo | PASS / PASS | `7617e3ce9d2548096c5f3db28631bfd98738762e` | `2026-11-05T14:34:57Z` |

The AI answer and direct API both identified the current authenticated store, `Australia/Adelaide`, AUD, and Odoo as the data source.

## Sales and answer reconciliation

| Check | SKR | Demo |
|---|---:|---:|
| Yesterday report, 2026-11-04 | AUD 0; 0 transactions | AUD 0; 0 transactions |
| Yesterday AI answer | Explicitly reports no completed sales for 2026-11-05; matches API zero | Same; matches API zero |
| Exact date 2026-10-16 | AUD 7,738.14; matches direct daily API | AUD 7,738.14; matches direct daily API |
| Last week 2026-10-25 to 2026-11-01 direct report | AUD 27,857.38; 941 transactions; 3,774 items | AUD 25,571.92; 860 transactions; 3,402 items |
| Last week AI answer | AUD 27,857.38, six sales dates; matches report | AUD 25,571.92, five sales dates; matches report |
| Date/range, data-as-of, store scope, source present | PASS | PASS |

The differing store totals and sale dates are retained as observed; the checks do not assume the two stores are identical at query time.

## Replenishment and forecast

- Both stores returned safe navigation to `/stock/replenishment`; the answer said supplier data was incomplete, generated no quantities, and required manual review. `writeRequests=[]`.
- SKR replenishment/forecast API returned HTTP 200. It reported 56 days of sales history (2026-09-11 through 2026-11-05), 2,263 eligible products, and a 7-day coverage horizon. Forecast status was `AVAILABLE`, but every product required review; the cost basis was explicitly simulated and not realized savings.
- SKR native inventory history was contiguous for 2026-11-01 through 2026-11-05: five observed days, 13,292/13,292 products, one of one warehouses, no missing quantity fields. It remains below the 28-day evaluation minimum. Supplier lead-time coverage was 0/13,292; the supplier-info source was unavailable.
- Demo replenishment/forecast API returned HTTP 502. Forecast and inventory metrics are therefore unavailable for Demo in this run; do not infer them from SKR.

## Gate decision

Sales question/date/source reconciliation passes for the tested cases. Online acceptance is partial: Demo forecast is blocked by HTTP 502; SKR recommendations remain review-only because supplier/lead-time evidence is missing and native inventory history has only five days. Keep production forecast policy and procurement automation unchanged.
