# Read-only replenishment decision contract

`POST /v1/forecast/inventory` continues to return projected daily inventory and
now also returns one `decisions` entry per product. Each entry includes:

- `risk`: `LOW`, `MEDIUM`, `HIGH`, or `UNKNOWN`
- `availableDays`: current on-hand plus on-order divided by average forecast demand
- `recommendedReplenishment`: demand during lead time plus safety stock, less current coverage
- `projectedAfterReplenishment`: projected stock after lead-time demand
- `confidence`, `reason`, and `dataQuality`

The endpoint remains `READ_ONLY`. It does not create a purchase order or call
an Odoo write method. The UI can show the decision and ask a staff member to
confirm a purchase draft separately. If demand is zero or inventory quality is
unknown, the decision is marked `UNKNOWN` or `LOW` confidence rather than
inventing a recommendation from missing data.
