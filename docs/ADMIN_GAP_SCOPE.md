# Admin gap — delivery scope

**Decided:** 2026-10-15  
**Source:** [admin gap analysis plan](../.cursor/plans/admin_gap_analysis_6d366018.plan.md) default (section 四) + dual P0 specs.

## Decision

| Layer | Host | Priority | Spec |
|---|---|---|---|
| **Platform console** | `app.orithos.com.au` | **Primary (P0 first)** | [PLATFORM_ADMIN_P0_SPEC.md](PLATFORM_ADMIN_P0_SPEC.md) |
| **Store backoffice** | `{slug}.orithos.com.au` (e.g. demo) | Secondary; do not expand Marketing/Gift cards before ops P0 | [STORE_ADMIN_P0_SPEC.md](STORE_ADMIN_P0_SPEC.md) |

## Rationale

- `app.*` is intentionally minimal today (Stores list + Create store only). That matches the user’s “功能少” complaint on that host.
- Store POS chrome stays on tenant hosts; middleware must not put Sell/Stock on `app.*`.
- Product roadmap still says: finish sell → refund → close and real receive before broad page growth on the store side. Store P0 is therefore **scoped for a later build**, not skipped from planning.

## Out of scope for these P0 specs

- Platform P1+ (operator accounts, audit log UI, billing, feature flags)
- Store P1+ (promotions, gift cards, AR, hardware, SMTP as a product feature beyond copy-link)
- Classic MySQL as writable SoT
- Impersonation into a tenant store
