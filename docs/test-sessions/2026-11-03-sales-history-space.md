# Sales History space and toolbar — 2026-11-03

Sales lines previously capped the table at 55dvh inside a much taller modal, leaving unused space below pagination. Its extra padded border, explanatory sentence and second refresh button also made the two views inconsistent.

The history host now uses the shared records panel's embedded layout: table fills remaining height, pagination stays below it, and the host owns refresh. Other records panels retain their current layout. The daily refresh timestamp is shown only in the daily view rather than presented as sales-line freshness.

- PASS: changed TSX syntax and git diff whitespace checks.
- PASS: targeted ESLint, zero errors; one existing exhaustive-deps warning in the daily request cleanup on current main.
- Local full typecheck remains unavailable due to incomplete worktree dependencies; no local application build, per repository policy.
- PASS: Dokploy build and deploy of `f2091f312d7645e51879eafe1b742f5527d9f4bf`, completed 2026-11-03T10:43:36Z. Remote frontend compilation and backend 510 tests passed. SKR frontend/backend runtime both confirmed this SHA.
- PASS: authenticated SKR browser check at 1440x1000 measured the lines table viewport at 758px and only 17px from the pagination bottom to dialog bottom. Redundant description and refresh button are absent.
- PASS: header refresh requests sales lines; next/previous pages return 41–80/1–40. Both view toolbars align, reopening defaults to daily, and `/history` at 390x844 has no page horizontal overflow with pagination visible.
- PASS: daily and lines API HTTP 200; live screenshot inspected. Browser evidence is stored in ignored `.local/sales-history-space-{daily,lines,mobile}.png`.
- Initial browser login overlapped service restart; retry succeeded. The first pagination text assertion failed due to local script character encoding; corrected assertion passed without product changes.
- No business data changes; verification is read-only.
