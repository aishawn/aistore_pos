# 2026-11-20 Sommelier Inferred Profile UAT

## Runtime identity

Demo and SKR `/api/public/version` both returned frontend and backend SHA `25b2d72666bb3a96ebd47c6c8212064e9231532f`, matching the source commit under test.

## API checks

The existing authenticated read-only runner `scripts/pilot-ai-sommelier-recommend-online-uat.mjs` passed 7/7 checks on each store: runtime identity, login, Shiraz identification, recommendation response, requested wine type, unique in-stock products within budget, and catalog identity. The request returned three cards per store. A follow-up response-shape check confirmed every card included the boolean `inferred` field and all three were `true` on both stores.

Raw runner summaries are in the ignored local files `.local/ai-eval/sommelier-recommend-20261120T014730899Z.json` (Demo) and `.local/ai-eval/sommelier-recommend-20261120T014747748Z.json` (SKR). They contain no credentials.

## Browser checks

Authenticated Playwright runs on Microsoft Edge completed the red-wine recommendation flow on both stores. Each page displayed three result cards and three `Estimated profile` labels. Opening the first card's `Help me sell` page displayed `Tasting profile and food pairings are estimated.` Both runs passed.

## Scope and limits

Requests used the deterministic recommendation and catalog paths; no paid model call or POS business write was made. Authentication created a normal session and the browser/API checks logged out or closed the session afterward. This verifies metadata and disclosure rendering on the deployed SHA. It does not assess whether inferred tasting profiles are accurate; that still needs a labeled wine sample set and sommelier/store-staff ratings.
