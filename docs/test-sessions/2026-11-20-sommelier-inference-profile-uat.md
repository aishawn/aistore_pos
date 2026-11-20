# 2026-11-20 Sommelier Inferred Profile UAT

## Runtime identity

The feature commit `25b2d72666bb3a96ebd47c6c8212064e9231532f` was initially live on Demo and SKR. After the evidence record was pushed, both stores redeployed the current `main` SHA `ae39da3d60aba024b5ab8e2c161b9f1709eed1d3`; final API and browser reruns below used that exact runtime SHA, which includes the feature commit.

## API checks

The authenticated read-only runner `scripts/pilot-ai-sommelier-recommend-online-uat.mjs` passed 8/8 checks on each store: runtime identity, login, Shiraz identification, recommendation response, inference provenance, requested wine type, unique in-stock products within budget, and catalog identity. The response-shape check requires each card's `inferred` field to be boolean; it does not require either value. On this sample, all three cards were `true` on both stores.

Raw runner summaries are in the ignored local files `.local/ai-eval/sommelier-recommend-20261120T014730899Z.json` (Demo) and `.local/ai-eval/sommelier-recommend-20261120T014747748Z.json` (SKR). They contain no credentials.

## Browser checks

Authenticated Playwright runs on Microsoft Edge completed the red-wine recommendation flow on both stores at runtime `ae39da3d60aba024b5ab8e2c161b9f1709eed1d3`. Each page displayed three result cards and three `Estimated profile` labels. Opening the first card's `Help me sell` page displayed `Tasting profile and food pairings are estimated.` Both runs passed.

## Scope and limits

Requests used the deterministic recommendation and catalog paths; no paid model call or POS business write was made. Authentication created a normal session and the browser/API checks logged out or closed the session afterward. This verifies metadata and disclosure rendering on the deployed SHA. It does not assess whether inferred tasting profiles are accurate; that still needs a labeled wine sample set and sommelier/store-staff ratings.
