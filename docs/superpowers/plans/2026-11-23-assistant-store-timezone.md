# Assistant Store Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Assistant data timestamps in the authenticated store's timezone on both new answers and restored answer cards.

**Architecture:** Keep the API's ISO timestamp unchanged and format it in the existing Assistant provenance helper using the response's `reportTimeZone`. Preserve date-only values and return an invalid timestamp unchanged. Pass the same timezone to message and card metadata rendering.

**Tech Stack:** TypeScript, Node test runner via `tsx`, Next.js POS UI.

---

### Task 1: Format Assistant timestamps in store time

**Files:**
- Modify: `pos-ui/src/lib/assistant-provenance.test.ts`
- Modify: `pos-ui/src/lib/assistant-provenance.ts`
- Modify: `pos-ui/src/components/SellAiPanel.tsx`

- [x] Add a regression test for Melbourne daylight and standard time:

```ts
test("formats assistant data timestamps in the store timezone across DST", () => {
  assert.equal(formatAssistantDataAsOf("2026-11-23T15:00:00Z", "Australia/Melbourne"), "24 Nov 2026, 2:00 am");
  assert.equal(formatAssistantDataAsOf("2026-07-23T15:00:00Z", "Australia/Melbourne"), "24 July 2026, 1:00 am");
});
```

- [x] Run the focused test with the repository Node 24 runtime and confirm it fails because the formatter does not accept a timezone. It failed with Shanghai-local `2026/11/23 23:00:00` instead of Melbourne `24 Nov 2026, 2:00 am`.
- [x] Add optional `timeZone` and locale arguments to `formatAssistantDataAsOf`; retain date-only strings, format valid timestamps with `Intl.DateTimeFormat`, and return the original value for invalid input or an invalid zone.
- [x] Pass `cardTimeZone` and `msg.reportTimeZone` from `SellAiPanel.tsx` to `assistantDataTimestampLabel` for card and message timestamps.
- [x] Run the focused provenance test (17/17), all POS UI unit tests (346/346), TypeScript, and targeted ESLint (0 errors; 3 existing React effect warnings) for the touched files.
- [x] Inspect `git diff --check` and the scoped diff; no whitespace errors were reported.
- [x] Commit the three source/test files and this plan, and push `main` per the repository release policy (`b4519ed0638245c71074930fcfbe7f8daea9e0d0`).
- [x] Verify `/api/public/version` reports the pushed SHA for SKR and Demo and run read-only timestamp/display acceptance in both stores (7/7 checks passed per store; no business writes).
