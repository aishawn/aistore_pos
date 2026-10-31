# AI Q&A Evaluation

This directory contains the read-only evaluation harness for the POS assistant.
It is deliberately separate from command execution tests.

## Workflow

```text
skr read-only export -> build-skr-snapshot.mjs -> data/skr-snapshot.json
                                      |
                                      +-> run-local-eval.mjs
```

The source export is never sent to the model and is not committed. The snapshot
contains only fields needed by assertions. Customer contact fields are removed
and customer names are replaced with stable opaque labels.

Build a snapshot:

```powershell
node scripts/ai-eval/build-skr-snapshot.mjs --input .local/skr-export.json --output data/ai-eval/skr-snapshot.json
```

Fetch a read-only snapshot directly from the authenticated skr store. The
fetcher opens the store after login, initializes the Odoo session, and only
then reads the paginated product directory:

```powershell
$env:SKR_USERNAME = "shawn"
$env:SKR_PASSWORD = "..."
$env:SKR_SNAPSHOT_OUTPUT = ".local/skr-snapshot.json"
node scripts/ai-eval/fetch-skr-readonly.mjs
node scripts/ai-eval/build-skr-utterances.mjs .local/skr-snapshot.json .local/skr-utterances.jsonl
```

Run the local fixture evaluator:

```powershell
node scripts/ai-eval/run-local-eval.mjs --cases scripts/ai-eval/fixtures/utterances.jsonl
```

For forecast backtests, pass the generated native inventory history as the
third argument. Complete date coverage replaces inferred `stock.move` flags;
partial coverage is reported as incomplete and is never treated as zero
demand:

```powershell
python scripts/ai_forecast_eval.py .local/skr-forecast-snapshot.json `
  .local/ai-eval/forecast-report.json `
  .local/ai-eval/inventory-history.json
```

Profile a fetched snapshot before using it for evaluation. The report keeps
missing domains explicit: a product-only snapshot cannot certify sales,
pricing, or replenishment quality.

```powershell
node scripts/ai-eval/profile-snapshot.mjs .local/skr-snapshot-live.json .local/skr-snapshot-profile.json
```

Run against a read-only assistant endpoint by setting `AI_EVAL_ENDPOINT` and
`AI_EVAL_TOKEN`. The endpoint must be an assistant/query endpoint and must not
be a command or write endpoint. A failed or unavailable endpoint is reported as
`BLOCKED`, never as `PASS`.

For live dynamic product checks, use `run-skr-live.mjs` with the generated
JSONL. It checks the runtime SHA, intent, route, product query and empty
`writeRequests`, with exponential retry for transient 502/503/504 responses.

## SKR forecast history (read-only)

The product snapshot does not contain historical sales. Use the separate
forecast fetcher to read completed SKR POS orders and their product lines:

```powershell
$env:SKR_USERNAME = "..."
$env:SKR_PASSWORD = "..."
$env:SKR_PRODUCT_SNAPSHOT = ".local/skr-snapshot-live.json"
$env:SKR_FORECAST_MAX_ORDERS = "5000"
$env:SKR_FORECAST_DETAIL_CONCURRENCY = "6"
$env:SKR_FORECAST_SNAPSHOT_OUTPUT = ".local/skr-forecast-snapshot-live.json"
node scripts/ai-eval/fetch-skr-forecast-readonly.mjs
```

This collector only calls authenticated `GET`/read endpoints. It removes
customer data and stores product/date aggregates. If the order cap is reached,
the output is explicitly `INCOMPLETE_ORDER_CAP` and must not be used as a
production backtest. The output also records that stockout and inventory
history are unavailable until those read-only sources are added.

`ai_forecast_eval.py` rejects sparse selling-day observations as contiguous
daily demand. When order pagination is verified complete, it can create an
exploratory zero-filled series to compare seasonal-naive, moving-average,
Croston SBA and TSB baselines. This is not production acceptance: an open-day
calendar, historical stockout flags and historical inventory are still needed.
It reports `BLOCKED` when those inputs are missing or when the model quality
gate fails. Low-frequency products with fewer than 14 selling days are not
scored by the seasonal baseline and remain blocked pending intermittent-demand
model evaluation.

## Daily native inventory snapshot

Use the native Odoo collector for daily inventory history. It reads
`qty_available`, `virtual_available`, incoming/outgoing quantities, supplier
delay, current price band, Odoo `standard_price`, category, and warehouse scope with read-only
JSON-RPC calls:

```powershell
python scripts/ai-eval/fetch-skr-inventory-snapshot.py
```

The collector accepts credentials from process environment variables (for
example `ODOO_SERVICE_USERNAME` and `ODOO_SERVICE_PASSWORD`) or an ignored
`.env` file. Store output outside Git or in an access-controlled snapshot
volume. A Windows Task Scheduler action can run the command once per day from
the repository root; a container scheduler can invoke it with the same
environment variables. Every output carries `snapshotVersion`, `capturedAt`,
`dataQuality`, `warehouseScope`, and an empty `writeRequests` list. Keep the
files for at least 8 weeks before replacing inferred `stock.move` stockout
flags in acceptance backtests.

On Windows, register the daily task from the repository root. The task reads
the ignored `.env` file at runtime and performs read-only JSON-RPC calls:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ai-eval/register-daily-inventory-snapshot.ps1
```

Use `Unregister-ScheduledTask -TaskName Orithos-AI-Daily-Inventory-Snapshot`
to remove it. In deployed environments, store the resulting snapshots on an
access-controlled persistent volume rather than in Git.

After at least two capture dates exist, build the native product history used
by backtests:

```powershell
python scripts/ai-eval/build-inventory-history.py `
  --input .local/ai-eval/inventory-snapshots `
  --output .local/ai-eval/inventory-history.json
```

The history marks `actualStockoutDates` only when native `availableQty <= 0`,
records `incomingQty` and supplier lead time for each product-day, and detects
list-price changes. Promotion state remains explicitly `NOT_CAPTURED` until a
promotion or pricelist source is added; it is never inferred from a price
change. The collector also reads active Odoo pricelist rules and records
promotion rule transitions when product or template rules match; no matching
rule is reported separately from an unavailable pricelist source. Until 28 daily snapshots exist, the output is marked
`backtestReadiness=INSUFFICIENT_HISTORY` and must not replace the inferred
stockout flags in an acceptance backtest. The history also reports
`missingSnapshotDates` and `continuityStatus=GAPS_PRESENT` when the scheduler
misses a day.
