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
