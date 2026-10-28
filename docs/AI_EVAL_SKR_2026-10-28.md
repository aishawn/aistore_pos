# AI Assistant Evaluation Against skr

## Scope

This evaluation used the authenticated, read-only Assistant API at
`https://skr.orithos.com.au`. It did not call command parse/preview/confirm,
product writes, price writes, purchase orders, stocktake, or invoice writes.
Every run recorded `writeRequests` as empty.

## Evidence

| Run | Source/runtime identity | Result |
| --- | --- | --- |
| Representative smoke | `77904468e3d8d3f09bfb60cc1795ee802eec3f42` on both source and runtime | 12/12 PASS, 0 FAIL, 0 BLOCKED |
| Full catalogue | `822495ea` matched runtime | 387/387 PASS, 0 FAIL, 0 BLOCKED |
| Later full catalogue | `fe73a877` matched runtime | 385 PASS, 0 FAIL, 2 BLOCKED by HTTP 502 |
| Blocked case retry | `stock-lookup-inverted-en` and two date-sales cases | PASS on retry; provider/network transient |

The catalogue contained 387 utterances covering sales, quantity, average ticket,
stock, product search, pricing review, replenishment suggestions, wine and
grocery recommendation, invoice navigation, capability questions, safety
boundaries, Chinese/English phrasing and follow-up context.

The representative smoke included:

- sales today;
- price review;
- wine recommendation;
- replenishment suggestion;
- product and stock lookup;
- barcode lookup;
- invoice navigation versus invoice arrival query;
- purchase-order safety boundary;
- AI capability question.

## Findings

The tested deterministic routes correctly separated read-only questions from
guided actions. Purchase-order and price-change prompts returned guided-action
responses without writing business data. Recommendations and replenishment
returned review/navigation responses. The current skr catalogue did not match
the Demo-only `VB Cans` sample, so product-specific live assertions must use
names selected from the skr catalogue rather than hard-coded Demo names.

The new `scripts/ai-eval` tools include a redacting snapshot builder and a
real-data utterance generator. The direct `/api/odoo/records` export endpoint
returned `Orithos session expired` for the current skr session, so no live
customer or product snapshot was committed. The online Assistant evaluation
remains the authoritative real-data check until that read-only export session
flow is repaired.

## Release interpretation

The latest exact-SHA smoke is green. Full-catalogue results are strong, but
transient 502 responses remain a provider availability issue to monitor. A
future release gate should require the full catalogue to run against one fixed
runtime SHA and should classify transient 502/503/504 responses as `BLOCKED`,
never as model failures or passes.
