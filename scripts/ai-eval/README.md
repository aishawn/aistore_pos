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

Run the local fixture evaluator:

```powershell
node scripts/ai-eval/run-local-eval.mjs --cases scripts/ai-eval/fixtures/utterances.jsonl
```

Run against a read-only assistant endpoint by setting `AI_EVAL_ENDPOINT` and
`AI_EVAL_TOKEN`. The endpoint must be an assistant/query endpoint and must not
be a command or write endpoint. A failed or unavailable endpoint is reported as
`BLOCKED`, never as `PASS`.
