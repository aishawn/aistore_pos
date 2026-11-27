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

Without `AI_EVAL_ENDPOINT`, assistant assertions are `BLOCKED`; the runner only
checks that fixture expectations agree with the synthetic snapshot and emits
`fixtureContractAudit` so missing answer baselines and unsupported negative
assertions are visible without a service call. With an endpoint configured,
the runner applies the same answer, metric, language,
slot, deterministic-route, and no-write assertions as the read-only live
evaluator. Set both `AI_EVAL_SOURCE_SHA` and `AI_EVAL_RUNTIME_SHA` to the
verified source and deployed runtime commits; mismatches or unknown commits
are `BLOCKED`. Missing positive answer expectations for factual questions are
also `BLOCKED` until the fixture is completed. A behavior mismatch is `FAIL`.
Natural-language entries under `expected.negative` are not executed as tests;
unless they have been replaced with a supported structured assertion, the case
is `BLOCKED` and the report lists each unsupported entry.
The runner does not certify full POS behavior unless the response contract and
fixed fixture assertions cover that behavior. Use Java router tests for
deterministic routing and the read-only live evaluator for deployed behavior
and report reconciliation.

### Fixed and dynamic report questions

`fixtures/utterances.jsonl` is the offline fixed-answer contract. Do not put
relative-date report questions there without a fixed answer: their answer
changes with the business date and source data. `fixtures/dynamic-report-utterances.jsonl`
holds dynamic periods instead. The Demo read-only report UAT resolves each
period using the Melbourne business date and compares the assistant response
with the native overview for exactly the same inclusive date window.

Run the local contract tests and fixture audit:

```powershell
node --test scripts/ai-eval/*.test.mjs
node scripts/ai-eval/validate-catalog.mjs scripts/ai-eval/fixtures/utterances.jsonl
node scripts/ai-eval/validate-catalog.mjs scripts/ai-eval/fixtures/dynamic-report-utterances.jsonl
node scripts/ai-eval/validate-catalog.mjs scripts/ai-eval/fixtures/readonly-smoke.jsonl
node scripts/ai-eval/run-local-eval.mjs --cases scripts/ai-eval/fixtures/utterances.jsonl
```

Run dynamic report reconciliation against Demo only after its frontend and
backend runtime SHAs match the checked-out source commit. Credentials stay in
the local `.env` or process environment; the suite performs authenticated reads
and records an empty write list:

```powershell
$env:PILOT_BASE_URL = "https://demo.orithos.com.au"
$env:PILOT_REPORT_CASES = "scripts/ai-eval/fixtures/dynamic-report-utterances.jsonl"
node scripts/pilot-ai-report-readonly-orithos-uat.mjs
```

Use `PILOT_UAT_OUTPUT_PATH` to choose a report path. A runtime/source SHA
mismatch is `BLOCKED`; period or value disagreement is `FAIL`.

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
JSONL. A case passes only when the source and runtime SHAs match, the intent,
route and product query match, the route is deterministic with no model
fallback, and `writeRequests` is explicitly empty. Transient 502/503/504
responses receive bounded exponential retries; an SHA mismatch or unavailable
runtime is `BLOCKED`, never a pass.

Run the small read-only smoke set against Demo after its version endpoint
reports the expected deployed backend commit. The cases cover pricing-page
navigation, price-change confirmation guidance, and the invoice-record
boundary, stock clarification, unauthorized-route rejection, and raw-SQL
rejection; all are deterministic paths and do not perform business writes:

```powershell
$env:SKR_BASE_URL = "https://demo.orithos.com.au"
$env:SKR_USERNAME = "admin"
$env:SKR_PASSWORD = $env:INITIAL_ADMIN_PASSWORD
$env:SKR_SOURCE_COMMIT = "<verified-backend-commit>"
$env:SKR_CASES = "scripts/ai-eval/fixtures/readonly-smoke.jsonl"
$env:SKR_EVAL_OUTPUT = ".local/ai-eval/demo-readonly-smoke.json"
node scripts/ai-eval/run-skr-live.mjs
```

Keep `SKR_PASSWORD` in the local process environment; do not place it in the
fixture or report. The output is a read-only assistant response report.

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

## Bilingual speech benchmark and online acceptance

Build the synthetic benchmark corpus locally. It contains 50 Chinese and 50
Australian English prompts across product names, barcodes, numbers, dates,
noise, pauses, and code-switching. The generated audio and manifest are local
evaluation data; do not commit them or treat synthetic WER as real-user
accuracy. The generator needs Node 24+, Python with `imageio-ffmpeg`, the
installed Microsoft Huihui desktop voice, and Edge TTS 7.3.1+ for its en-AU
Natasha voice. Set `ASR_NODE_BIN` and `EDGE_TTS_BIN` when these executables are
not on `PATH`:

```powershell
$env:ASR_NODE_BIN = "C:\path\to\node.exe"
$env:EDGE_TTS_BIN = "C:\path\to\edge-tts.exe"
powershell -ExecutionPolicy Bypass -File scripts/ai-eval/generate-synthetic-transcription-audio.ps1
node --test scripts/ai-eval/transcription-benchmark.test.mjs scripts/ai-eval/transcription-uat-contract.test.mjs
```

After publishing a clean candidate, verify both stores report its exact backend
commit before sending any audio. Set `PILOT_BASE_URL`, credentials,
`PILOT_TRANSCRIPTION_MANIFEST`, and `PILOT_TRANSCRIPTION_MAX_CASES=100`, then
run `node scripts/pilot-ai-transcription-online-uat.mjs`. For bounded diagnosis,
use `PILOT_TRANSCRIPTION_CASE_OFFSET` and a small max-case count. The default is
only two requests. Review aggregate WER by language and critical-entity
accuracy for product identifiers, barcodes, numbers, and dates; do not retain
raw audio or full transcripts in shared reports. Runtime SHA mismatch or a dirty
source checkout blocks requests and cannot count as acceptance. Online reports
store aggregate request outcomes and p50/p95 latency by language and scenario.
When runtime model and config identities are available, benchmark reports also
store per-case edit/token/entity sufficient statistics, without audio or text.
Merge partial reports offline against the original manifest:

```powershell
node scripts/ai-eval/merge-transcription-reports.mjs `
  .local/ai-eval/synthetic-asr/manifest.json `
  .local/ai-eval/asr-merged.json `
  .local/ai-eval/asr-run-1.json .local/ai-eval/asr-run-2.json
```

Merging requires matching source/runtime commits, target, dataset fingerprint
(including local audio file hashes), ASR model, and ASR config. Exact duplicate
cases count once; duplicates with different statistics are rejected. The gate remains `BLOCKED` below 50
completed cases per language and only `PASS` when the original thresholds pass.

The synthetic English voice is en-AU (Microsoft Edge Natasha Neural), matching
the recognition locale. This supports repeatable synthetic coverage, not real
store speech accuracy. Keep human-reviewed, consented/de-identified recordings
as a separately labeled set so synthetic and real-speech scores are never
combined. Audio files use mono 16 kHz, 16-bit PCM WAV.

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

### Historical inventory for development research

Do not wait for 28 future capture dates to begin research. Odoo can calculate
historical `qty_available` using its `to_date` context. Query that read-only
history at each local business-day close and use it as a research label:

```powershell
python scripts/ai-eval/fetch-skr-historical-inventory.py `
  --sales-snapshot .local/ai-eval/skr-sales-snapshot.json `
  --days 90 `
  --company-id 5 `
  --output .local/ai-eval/skr-historical-inventory.json

python scripts/ai_forecast_eval.py `
  .local/ai-eval/skr-sales-snapshot.json `
  .local/ai-eval/forecast-research-report.json `
  .local/ai-eval/skr-historical-inventory.json
```

The result is labelled `ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE` and
`researchOnly=true`. It reads historical system quantities without waiting
for future snapshots. It is not an independent physical stocktake: historic
adjustments can be backdated, and company/warehouse scope or data corrections
can make an individual product unreliable. The collector flags products whose
nonpositive historical stock conflicts with repeated sales; the evaluator
excludes those products from stockout censoring while allowing eligible sales
series into exploratory forecast comparisons. Exit code `2` means quality
warnings were found; inspect the generated history and its
`researchBacktestReadiness` before using the report.

Use an expanding-window walk-forward evaluation to simulate forecasts made at
past dates. At each fold, the model sees sales and stockout labels only through
the training cutoff; later historical sales are the holdout outcome. This does
not require future inventory observations. Historical `to_date` inventory is
used only to label censored-demand dates and must cover the full sales date
range. It remains a system-history proxy, not independent physical stocktake
truth. A horizon with no complete fold, missing inventory labels, or incomplete
forecast output is `BLOCKED`, not a quality failure or a pass:

```powershell
python scripts/ai_forecast_walkforward_eval.py `
  --sales-snapshot .local/ai-eval/skr-sales-snapshot.json `
  --inventory-history .local/ai-eval/skr-historical-inventory.json `
  --output .local/ai-eval/skr-walkforward-report.json `
  --horizons 7 14 28
```

The evaluator reselects a model independently from each training prefix, so
holdout outcomes cannot affect model choice. Review results by product segment
and compare with fixed baselines; a strong aggregate score alone is not enough
to enable purchasing decisions. Reports show both `dailyWeightedWape` and
`horizonTotalWape`: daily error remains a diagnostic, while the exploratory
quality gate uses each product's cumulative demand over the full 7/14/28-day
forecast window. This better matches replenishment quantities for intermittent
items, and zero-demand windows still contribute their over-forecast error.

The current-balance-plus-done-moves reconstruction remains available as a
fallback when historical `to_date` queries cannot be used:

```powershell
node scripts/ai-eval/fetch-skr-inventory-moves-readonly.mjs
python scripts/ai-eval/build-reconstructed-inventory-history.py `
  --sales-snapshot .local/ai-eval/skr-sales-snapshot.json `
  --output .local/ai-eval/skr-reconstructed-inventory.json
```

Treat that fallback as lower-confidence research data because opening balance,
missing/backdated moves, and warehouse scope errors accumulate when reversing
movements. Daily native captures remain useful for forward calibration and
production acceptance, but are not a prerequisite for historical research.

After at least two capture dates exist, build the native product history used
by backtests:

```powershell
python scripts/ai-eval/build-inventory-history.py `
  --input .local/ai-eval/inventory-snapshots `
  --output .local/ai-eval/inventory-history.json
```

Use `--require-days 28` only for acceptance of independently captured native
daily snapshots. It still writes the diagnostic history but exits with code `2`
until 28 observed capture dates exist. Historical `to_date` data can support
development backtests before that threshold.

The history marks `actualStockoutDates` only when native `availableQty <= 0`,
records `incomingQty` and supplier lead time for each product-day, and detects
list-price changes. Promotion state remains explicitly `NOT_CAPTURED` until a
promotion or pricelist source is added; it is never inferred from a price
change. The collector also reads active Odoo pricelist rules and records
promotion rule transitions when product or template rules match; no matching
rule is reported separately from an unavailable pricelist source. Until 28
daily snapshots exist, native-snapshot acceptance remains
`INSUFFICIENT_HISTORY`; this does not block research backtests based on
historical `to_date` quantities. The history also reports
`missingSnapshotDates` and `continuityStatus=GAPS_PRESENT` when the scheduler
misses a day.

Validate a captured file before using it in a backtest. Structural failures
return exit code `1`; operational warnings return `2` and are recorded in the
report so a scheduler can alert without silently accepting suspicious data:

```powershell
python scripts/ai-eval/validate-inventory-snapshot.py `
  .local/ai-eval/inventory-snapshots/2026-10-31/inventory.json `
  --report .local/ai-eval/inventory-snapshots/2026-10-31/validation.json
```

The validator checks the native source marker, immutable/write-free contract,
timestamp and version, product ID uniqueness, required inventory/supplier/
promotion fields, warehouse scope, and large product-count changes.

The scheduled runner also rebuilds `.local/ai-eval/inventory-history.json`
after each successful capture. It does not require 28 days during daily
operation; the history remains explicitly marked `INSUFFICIENT_HISTORY` until
the acceptance threshold is reached.
