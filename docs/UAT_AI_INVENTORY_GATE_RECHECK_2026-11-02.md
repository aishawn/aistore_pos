# Native inventory gate recheck (2026-11-02)

Authenticated read-only replenishment responses were checked after the latest
deployment.

| Store | Observed days | Gap days | Product coverage | Warehouse coverage | Last attempt | Gate |
|---|---:|---:|---:|---:|---|---|
| Demo | 1 | 0 | 100% (12,987/12,987) | 100% (2/2) | SUCCESS | not ready |
| SKR | 2 | 0 | 100% (12,992/12,992) | 100% (1/1) | SUCCESS | not ready |

The local freshness checker also reports `NOT_READY` for the two-day native
history with reason `insufficient_observed_days` when the acceptance requirement
is 28 days. No dates were fabricated and no Odoo writes were made. Supplier lead
time coverage remains 0% for both stores, so replenishment remains manual-review
only.

The exact live response is recorded in
`docs/UAT_REPLENISHMENT_LEAD_TIME_BASELINE_2026-11-02.json`.
