# Assistant operational previews — 2026-11-01

## Findings

- The chat replenishment client uses an independent legacy Java query capped at 500 alphabetically sorted products, unlike the complete-catalogue business page. The screenshot reported supplier gaps for gift cards/prepaid products rather than actionable stockable goods.
- The built-in weekly sales question can reach the model and return generic provider failure. This does not establish that the API key is invalid.
- A temporary HTTP 503 previously disabled chat for the remainder of the mounted session.
- Large starter cards and visible technical diagnostics competed with business results.

## Changes

- Added a bounded, deterministic UI operational-preview path for the built-in stock/replenishment and week-to-date sales questions in English/Chinese. It uses the existing session-recovering Odoo client and tenant-scoped read routes. Modified questions, arbitrary filters, writes and ambiguous follow-ups continue to the normal workflow.
- Replenishment now uses the same complete-catalogue response as the purchases page. READY positive quantities are shown; REVIEW_DATA products are excluded and counted. Partial data is labelled Review needed, not total unavailability. Supplier lead-time gaps remain explicit. No purchase orders are created.
- Reporting dashboard supports `period=this_week`: Monday midnight to request time in the store timezone, including daylight-saving changes. Existing rolling-hour requests are unchanged. Net sales include refunds and applicable GST; transaction count represents positive sales, not refund transactions.
- Reused read endpoints retain their server-side session, tenant/company and Odoo permission enforcement. No tenant identity is supplied by the model or new client path.
- Transient HTTP 503 no longer switches off chat. Genuine disabled code 50301 still does.
- Reduced starter chrome, removed negative vertical translation, improved card opacity and action targets, added partial status, collapsed technical diagnostics, and labelled timestamps UTC. The purchase starter now promises a preview rather than automatic creation.

## Verification

- Node 24.19.0: 24 targeted unit tests passed, covering route scope, read-only requests, partial data, failure, authorization, cancellation, refunds and AU week/DST/year boundaries.
- `tsc --noEmit`: passed.
- Targeted ESLint: zero errors, three existing unused purity-disable warnings.
- Local Playwright fixtures: 1440px and 390px passed; partial results, failed sales read followed by successful retry replacing the card, no horizontal overflow, no page errors and zero business writes.
- Local development rendering reused installed dependencies (Next 16.2.1); it is not a lockfile-matched production build. Turbopack rejected the external node_modules junction; webpack development rendering passed. No production application build was run locally.
- Evidence: `docs/UAT_AI_ASSISTANT_OPERATIONS_LOCAL_2026-11-01.json`. Screenshots remain ignored under `.local/assistant-operations/`.

## Limits and next checks

- These are bounded UI business previews, not a repair to the model provider or legacy Java endpoint. Direct callers of the legacy assistant API still need a unified backend tool implementation. Changing pos-api requires the exact-candidate remote Java 21 pre-push gate in AGENTS.md.
- Operational previews currently live in the open UI conversation; they are not persisted into Spring AI thread history or supplied to model follow-ups. Use explicit self-contained questions. Unifying backend tools/history is the next integration step.
- Fixture UAT proves presentation and request behavior only. Live SKR data, provider health, deployed SHA and source/runtime matching have not been accepted by these tests. Repeat authenticated read-only checks after deployment.
- AI_COMMANDS_EXECUTION_ENABLED, AI_PURCHASE_DRAFT_ENABLED and AI_PURCHASE_CONFIRM_ENABLED remain unchanged/closed. No SKR business data was written.
