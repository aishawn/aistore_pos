# Runtime health follow-up (2026-11-05)

## Read-only evidence

At the current check, both POS stores expose the same deployment identity:

| Endpoint | HTTP | Frontend/backend SHA | Built at |
|---|---:|---|---|
| `https://skr.orithos.com.au/api/public/version` | 200 | `b90905beec3db26ea165fe8f53f6271a37448ffb` | `2026-11-05T14:00:43Z` / `14:00:41Z` |
| `https://demo.orithos.com.au/api/public/version` | 200 | `b90905beec3db26ea165fe8f53f6271a37448ffb` | `2026-11-05T14:00:43Z` / `14:00:41Z` |

The direct read-only Odoo database selector `https://odoo.orithos.com.au/web/database/selector` did not return within a 20-second client timeout. No login, AI question, report mutation, RFQ, purchase order, or business write was attempted in this check.

## Interpretation

The POS deployment identity is current and consistent across SKR and Demo. The Odoo upstream remains unavailable or unreachable from this client path, so this evidence cannot establish Odoo health, AI answer correctness, report reconciliation, or forecast acceptance. It also does not prove that the Odoo containers are stopped; container-level evidence still requires Dokploy UI/server logs.

## Gate impact

Keep online AI acceptance blocked until the Odoo route/session contract is repaired and the fixed-SHA read-only harness is rerun on both stores. Keep forecast policy, manual procurement review, and automatic purchasing unchanged.
