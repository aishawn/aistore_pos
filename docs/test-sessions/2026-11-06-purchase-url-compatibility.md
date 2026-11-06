# Purchase URL Compatibility and Inventory Count Review

- Date: 2026-11-06
- Scope: legacy `/purchases?state=purchase` link handling; explain Shopfront versus Odoo product counts and Odoo positive-stock total.
- Source base: `origin/main` at `43fb774d9c6d7358762e843f0b9a7463d4577958`.
- Runtime before follow-up: SKR, Demo, and App `/api/public/version` reported frontend/backend `43fb774d9c6d7358762e843f0b9a7463d4577958`, built at 2026-11-06 07:11 UTC.
- Changes: legacy receipt-filter URLs now replace to the canonical `/purchases` route; removed-tab behavior is recorded in the reporting design/progress.
- Screenshot review: Shopfront shows 10,849 product results; Odoo inventory shows 13,292 variants and 50,992 positive stock units, with 5,379 negative-stock variants called out separately. Counts have distinct source scopes. The displayed positive quantity excludes negative balances. This review does not prove row-level Shopfront-to-Odoo parity.
- Checks: `git diff --check` PASS. Node 24.22.1 direct TypeScript CLI ran but failed on missing Next.js modules/declarations in the incomplete local install. Targeted ESLint could not load its package metadata. `scripts/check-project-docs.py` reported 65 pre-existing missing documentation/evidence files. Browser redirect and exact-follow-up runtime checks NOT RUN.
- Business writes: 0.
- Known limits: no authenticated live row-level comparison; the follow-up is not yet deployed at the time of this record.
