# Native inventory snapshot

`scripts/ai-eval/fetch-skr-inventory-snapshot.py` captures the current Odoo
inventory state with read-only JSON-RPC calls. It writes one immutable file per
UTC capture date under `.local/ai-eval/inventory-snapshots/YYYY-MM-DD/inventory.json`.

Each product records Odoo's native `qty_available`, `virtual_available`,
`incoming_qty`, `outgoing_qty`, category, current list price, `standard_price`,
product type (`productType`), and explicit `isStockable`, `isSellable`,
`isPurchaseable`, and `isReplenishmentEligible` flags. It also records active Odoo pricelist rule metadata and
the shortest configured supplier delay. The file also records the company, warehouse scope,
capture timestamp, source database, data-quality label, and an empty
`writeRequests` audit list. Missing supplier lead time is kept as `null`.

Run it from the repository root with the ignored `.env` containing the Odoo
service credentials:

```powershell
python scripts/ai-eval/fetch-skr-inventory-snapshot.py
```

The default database is `aipos_uat` and the SKR company is `5`; override them
with `ODOO_DATABASE` or `SKR_ODOO_COMPANY_ID` in the environment when needed.
The output is suitable for a daily scheduler. A company with multiple
warehouses is explicitly marked `COMPANY_AGGREGATE`; the collector does not
pretend company-level quantities belong to one warehouse. Historical stockout
backtests must continue to label `stock.move`-derived flags as inferred until
enough daily native snapshots exist to reconstruct actual stockout days. The
replenishment decision layer must gate on `isReplenishmentEligible`; services
and non-purchasable virtual products must not generate purchase recommendations.

Check freshness separately from backtest readiness. The check reports `FRESH`,
`STALE`, or `NOT_READY` and never treats an old history file as current:

```powershell
python scripts/ai-eval/check-inventory-history-freshness.py `
  .local/ai-eval/inventory-history.json --max-age-hours 36 --require-days 28
```

The daily runner writes the diagnostic to
`.local/ai-eval/inventory-history-freshness.json`. It remains read-only and
does not fail the normal capture task merely because 28 days have not yet
accumulated.
