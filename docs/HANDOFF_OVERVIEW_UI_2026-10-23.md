# Overview UI — 2026-10-23

Implemented locally: Apple-inspired light Overview with a shared header, permission-derived modules, truthful 24-hour pulse, device-local parked-sale next steps, and Workspace as the default store landing. Explicit `/overview` still opens Radial. Platform and mobile-mode landing behavior remain intact.

Radial groups now preview on mouse hover and pin on click. All permitted children are accessible, with Escape, focus restoration and arrow-key navigation. The menu uses measured container coordinates, with a grouped list for constrained space and no layout change solely because reduced motion is enabled. The logo opens the same quick menu without redirecting away from Workspace.

Screenshot iteration corrected overlapping mobile AI entry (now in the Overview toolbar), cramped mobile submenu labels (expanded groups occupy a full row), clipped-menu risks and submenu/module collisions. Existing shared branding changes elsewhere in this working tree belong to other work and are excluded from this change set.

## Validation

- Node 24.19.0 `tsc --noEmit`: PASS. Targeted ESLint: PASS, zero warnings at final check.
- `node --experimental-strip-types --test scripts/overview-navigation.test.mjs`: 4/4 PASS; default/explicit landing, platform/mobile compatibility, permission filtering, complete Setup children.
- `node scripts/overview-apple-ui-uat.mjs`: 59 checks PASS. Chromium local fixture UI at 1440×900, 1280×800, 1024×768, 1440×700, 390×844, 320×740. Both layouts, zero/long-name/restricted/retry/reduced-motion states, loading and disconnected state, all group expansion, touch, keyboard, focus restoration, modal scrolling, toolbar AI and geometry checks. Zero page errors and zero business writes. The disconnected fixture mocks an auth-refresh POST; this is recorded separately in the evidence and never reaches a real server.
- Rehomed analytics regression: layout 15/15 PASS; stale-response/range race PASS, zero business writes. These legacy scripts now target `/reports/dashboard` and the current Reports accessibility IDs. Their outputs use new Reports-specific paths, preserving previous evidence.
- No local production build or backend verification was run. No backend source is included.

## Evidence and comparison

- [UI fixture evidence](UAT_OVERVIEW_APPLE_LOCAL_2026-10-23.json)
- [Reports layout](UAT_REPORTS_LAYOUT_REHOMED_2026-10-23.json), [Reports race](UAT_REPORTS_RACE_REHOMED_2026-10-23.json)
- [Before/after comparison](screenshots/2026-10-23-overview-apple/before-after-comparison.jpg)
- [Workspace desktop](screenshots/2026-10-23-overview-apple/workspace-1440x900.png), [Radial and Setup](screenshots/2026-10-23-overview-apple/radial-long.png)
- [Mobile lower content](screenshots/2026-10-23-overview-apple/workspace-320-scrolled.png), [mobile expanded quick menu](screenshots/2026-10-23-overview-apple/quick-menu-320-expanded.png)

Before images are the user's supplied references. After images use isolated browser fixtures, not real store revenue, and prove UI behavior only. Viewport screenshots intentionally retain the app's internal scrolling; the mobile lower-content captures separately verify the content below the fold.

## Release status

Local implementation and fixture acceptance complete. Deployment not verified: no `DOKPLOY_WEBHOOK_URL` was present in the checked environment/local configuration, and a read-only Demo `/api/public/version` probe returned HTTP 403. Do not infer that a Git push is a deployment or attribute online results to this source before checking its running SHA. Pilot readiness is unchanged.
