# POS API OpenAPI build source correction

Date: 2026-11-07

## Scope

Keep the Next.js OpenAPI source, generated public YAML assets, and API-docs page examples aligned with the POS API behavior.

## Evidence

- Backend/runtime source before this UI-only correction: `325c40a622ad11f99a4ed0ba923b02098905a44c` on SKR and Demo.
- Root cause: `pos-ui/package.json` runs `scripts/sync-pos-api-openapi.mjs` before build, and the script copies `pos-ui/openapi.yaml` over both public copies. The previous candidate changed only generated copies.
- Node 24 ESLint for `app/api-docs/page.tsx`: PASS.
- Node 24 TypeScript `tsc --noEmit`: PASS.
- OpenAPI YAML/schema validation, both 12-resource read enums, and byte equality across the feature spec, UI source, and both public assets: PASS.
- Runtime check for the corrected download and authenticated UAT checks: pending deployment.
- No business writes were performed.

## Limitations

The `/api/odoo/uat-context` endpoint attests Odoo isolation. Before business-write acceptance, also verify the POS PostgreSQL URL points to the dedicated UAT database required by the isolation runbook.
