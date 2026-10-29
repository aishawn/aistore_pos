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
