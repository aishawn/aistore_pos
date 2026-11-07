# Cost Audit Gateway Timeout

Date: 2026-11-07
Target: `https://skr.orithos.com.au`
Runtime before change: `d814f135045db567a35b1e4a3a6a5a4801947159`
Scope: authenticated read-only Odoo API calls; no business writes.

## Reproduction

- Default request (`limit=20`, default last 30 completed business days): HTTP 502 after 30.2 seconds; the site's error parser reported an HTML error page.
- One completed business day (`limit=20`): HTTP 200 after 13.8 seconds, returning 20 products and 27 sale lines.
- POS login and Odoo session establishment both returned HTTP 200 before the requests.

This isolates the failure to the long synchronous capture exceeding the gateway response window. It is not evidence of an Odoo permission failure.

## Candidate change

- `POST /api/odoo/cost-reconciliation` now schedules the unchanged read-only capture and returns HTTP 202 with a job ID.
- `GET /api/odoo/cost-reconciliation?job=<id>` applies the existing admin, company, and store checks and reports running/completed/failed state. A completed audit is read from its saved snapshot file.
- Identical requests for the same company/store scope join its active job; a different range or product limit is rejected until it completes. In-process job status is lost if the service restarts; the UI reports that condition and allows a new capture.
- The Products dialog polls the job, waits up to four minutes, and offers a retry control on failure.

## Verification

- Node 24.22.1 TypeScript check: PASS.
- Targeted ESLint: zero errors; one existing `react-hooks/set-state-in-effect` warning in the panel's URL initialization effect.
- Cost reconciliation unit tests: 17/17 PASS.
- `git diff --check`: PASS. The repository documentation checker reports 65 existing missing-file/link errors across the broader `docs/project` tree in this checkout; none point to the new reporting references.
- Fix commit `99d996eb` is pushed to GitHub `main`; local `main` matches `origin/main`.
- Dokploy deploy hook returned HTTP 301. Further retries were stopped; confirm Dokploy Git repository and branch settings. SKR and Demo still report runtime `9f0d733c`, so candidate deployment and browser verification are BLOCKED.
- No database writes: PASS (read-only endpoint).
