# Sales History layout — 2026-11-03

Change: enlarge Sales History modal from max 1024px to 1600px and from capped 92dvh/900px to 96dvh. Move Daily summary / Sales lines view switch into each view's All time/filter toolbar. Initial state remains daily and reopens as daily. Narrow screens wrap toolbar controls.

Only three UI components change. No API or business data changes. No local application build or business writes. Static checks and live deployment/browser verification are recorded below when available.

- PASS: TSX syntax diagnostics for all 3 changed components.
- PASS: targeted ESLint against changed contents using the existing primary workspace config/dependencies (no diagnostics).
- BLOCKED: full local typecheck/configured lint in temporary worktree because prior disk exhaustion left its Next.js install incomplete. No full local success claimed; remote build remains the release gate.
