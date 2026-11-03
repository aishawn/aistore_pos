# Sales History space and toolbar — 2026-11-03

Sales lines previously capped the table at 55dvh inside a much taller modal, leaving unused space below pagination. Its extra padded border, explanatory sentence and second refresh button also made the two views inconsistent.

The history host now uses the shared records panel's embedded layout: table fills remaining height, pagination stays below it, and the host owns refresh. Other records panels retain their current layout. The daily refresh timestamp is shown only in the daily view rather than presented as sales-line freshness.

- PASS: changed TSX syntax and git diff whitespace checks.
- PASS: targeted ESLint, zero errors; one existing exhaustive-deps warning in the daily request cleanup on current main.
- Local full typecheck remains unavailable due to incomplete worktree dependencies; no local application build, per repository policy.
- Remote deployment and authenticated browser layout/refresh/pagination checks pending.
- No business data changes; verification is read-only.
