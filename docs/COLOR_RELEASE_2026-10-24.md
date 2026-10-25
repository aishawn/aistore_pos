# Palette production release — 2026-10-24

The release is assembled in an isolated checkout of GitHub main (base b36f35ed), rather than staging the shared working tree. Only palette tokens, CSS, button/selection states, existing reports/admin/sommelier components, and the existing AI mark are included. Backend, API, payment, authentication and business logic are unchanged. Existing production layouts and logo geometry are preserved.

`COLOR_CONSISTENCY_2026-10-24.md` and its screenshots describe the earlier shared-workspace fixture audit. They are historical local evidence, not an exact release screenshot or production acceptance. In particular, uncommitted dashboard layout/artwork, recommendation routes and assistant workspace behavior remain outside this release. Existing production Overview modules receive the same seven module tokens; existing AI artwork receives brand colors. The unpublished local preview login button is not added to production.

The production brand site is actually deployed through Dokploy application `orithos_brand`, not the Vercel deployment mentioned in older brand-site documentation. Production POS uses Dokploy Compose `aistorepos`; UAT Compose is a separate environment and is not changed by this release.

Validation: release POS TypeScript passed. Brand TypeScript initially lacked ignored generated `.source` content in the clean checkout; it is checked again after attaching the existing generated documentation types. No local application build is run. Remote application builds and runtime identity are recorded separately after deployment. No live business writes are authorized or performed.
