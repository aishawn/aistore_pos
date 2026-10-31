# SKR AI Forecasting Foundation

This release adds the read-only forecasting foundation for the SKR driven
store decision workflow.

## Runtime boundaries

- Odoo/SKR remains the source of truth.
- The snapshot sync is read-only and scoped to the authenticated vendor and outlet.
- `AI_FORECAST_ENABLED` is disabled by default.
- `AI_COMMANDS_EXECUTION_ENABLED` remains disabled by default.
- Forecast failures return an unavailable state; they never become zero demand.
- Forecast output is advisory. Purchase drafts and Odoo writes are not enabled by this change.

## Data flow

```text
Odoo read_group
  -> ai_sales_daily / ai_inventory_daily
  -> forecast-service
  -> Java forecast client
  -> replenishment preview and risk endpoints
```

Daily sales are stored by product, outlet and business date with a source
version. Inventory snapshots record current and virtual stock and mark a
zero-on-hand day as a stockout candidate. Date grouping failures in Odoo are
logged and safely degrade the existing aggregate snapshot; they do not create
synthetic daily facts.

## APIs

```text
POST /api/ai/forecast/sales?horizonDays=14
POST /api/ai/forecast/risks?horizonDays=14
POST /api/ai/decisions/replenishment/preview
```

The forecast service exposes the internal equivalents:

```text
GET  /health
POST /v1/forecast/sales
POST /v1/forecast/demand
POST /v1/backtest
```

The evaluator now compares seasonal-naive, moving-average, exponential
smoothing, Croston SBA, TSB and a two-stage occurrence/quantity model. Each
product selects its winner from rolling backtests. When the snapshot supplies
both stockout and holding costs, selection uses business cost (under-forecast
loss + overstock holding/expiry risk); otherwise it falls back to weighted
WAPE with bias as a tie-breaker. Reports also expose service-level proxies and
explicitly mark expected post-replenishment stockout days as unavailable until
native inventory history exists.

## Next gates

1. Run the schema migration and perform a read-only SKR sync with a fixed source version.
2. Confirm daily rows contain valid dates, zero-fill gaps, and explicit quality states.
3. Run rolling 7/14/28 day backtests against seasonal and intermittent-demand baselines.
4. Review stockout and overstock alerts in one isolated store for at least four weeks.
5. Add weather, public holidays, promotions and censored-demand correction only after the baseline is measurable.
6. Keep purchase draft and purchase confirmation switches off until Odoo write/readback and audit UAT passes.
7. For development research, use `fetch-skr-historical-inventory.py` to
   reconstruct historical `qty_available` with Odoo `to_date`; exclude
   product-level contradictions and label the results reconstructed.
8. Require at least 28 continuous native daily snapshots only for production
   stockout/replenishment acceptance. Reconstructed history is not a substitute
   for that production gate.

## Reproducible evaluation

Run the read-only fixed snapshot evaluation from the repository root:

```text
python scripts/ai_forecast_eval.py
```

The runner writes `reports/ai-forecast-eval.json` and records both the source
snapshot SHA and runtime SHA. `status` describes whether the run completed;
`qualityGate` is a separate model quality decision. A high WAPE on a series
with stockout flags is expected to trigger review, not to be hidden as a zero
demand result. The runner evaluates rolling 7/14/28-day windows and marks a
horizon `BLOCKED` when the snapshot does not contain enough history. The runner
also compares the seasonal baseline with a seven-day moving-average challenger;
model promotion requires a fixed-snapshot improvement, not model complexity.
It always reports `writeRequests: []`.
