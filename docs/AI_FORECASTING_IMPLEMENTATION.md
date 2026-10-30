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

The initial model is a deterministic seven-day seasonal baseline with P50,
P80 and P90 values. It is intentionally a benchmark, not a claim that a
foundation model is more accurate. A production model promotion must be based
on fixed SKR snapshots and rolling WAPE/MAE/Bias and interval coverage results.

## Next gates

1. Run the schema migration and perform a read-only SKR sync with a fixed source version.
2. Confirm daily rows contain valid dates, zero-fill gaps, and explicit quality states.
3. Run rolling 7/14/28 day backtests against seasonal and intermittent-demand baselines.
4. Review stockout and overstock alerts in one isolated store for at least four weeks.
5. Add weather, public holidays, promotions and censored-demand correction only after the baseline is measurable.
6. Keep purchase draft and purchase confirmation switches off until Odoo write/readback and audit UAT passes.
