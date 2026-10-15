# Platform admin P0 — store detail & lifecycle

**Host:** `app.orithos.com.au` only (`PlatformShell`)  
**Audience:** platform operator (`platformOperator` on `/api/auth/me`)  
**Scope decision:** [ADMIN_GAP_SCOPE.md](ADMIN_GAP_SCOPE.md)

## Goal

Let operations **inspect one store** and **change lifecycle** (suspend / activate / extend trial / expire) plus **issue owner reset or re-invite links** without opening the tenant POS shell.

## Current baseline (already in repo)

| Capability | Status | Location |
|---|---|---|
| List stores (search, status filter, pagination) | Done | `GET /api/admin/tenants` · [app/platform/stores/page.tsx](../pos-ui/app/platform/stores/page.tsx) |
| Detail payload (owner, outletId, storeUrl) | **API done, UI missing** | `GET /api/admin/tenants/{id}` · [AdminTenantController.java](../pos-api/src/main/java/com/orithos/tenant/AdminTenantController.java) |
| Create store | Done | `POST /api/admin/tenants` + `/signup` |
| `vendor.status` column write helper | Mapper only | `VendorMapper.updateStatus` — **no controller endpoint** |
| Extend trial | Missing | No `trial_ends_at` update mapper/API |
| Platform-scoped owner reset / re-invite | Missing | Store-scoped `AccountLifecycleService.issueResetLink` / `inviteUser` use `CurrentUser` vendor |

## UI

### 1. Store detail page

- **Route:** `/platform/stores/[id]`
- **Shell:** existing `PlatformShell` (middleware already allows `/platform/*`)
- **Nav:** add optional “Stores” breadcrumb; list row name becomes a link to detail; keep external “Login” on list
- **Layout:** reuse `AdminPageLayout` + confirm dialogs (`ConfirmDialog`)

**Sections**

1. **Identity** — name, subdomain, status badge, contact name, createdAt, trialEndsAt, storeUrl (open tenant login)
2. **Owner** — username, name, email, isAdmin (from detail `owner`; show empty state if null)
3. **Outlet** — `outletId` (read-only in P0; no multi-outlet editor)
4. **Actions** — buttons below; each opens confirm modal with consequence copy

**List change:** store name → `/platform/stores/{id}`; do not remove status filter.

### 2. Actions (P0)

| Action | Allowed from | Effect | Confirm copy (EN) |
|---|---|---|---|
| **Suspend** | `trial` \| `active` | `status = suspended` | Store staff cannot use this subdomain until reactivated. |
| **Activate** | `suspended` \| `expired` \| `trial` (optional) | `status = active`; optionally clear past trial | Restores access for this store URL. |
| **Mark expired** | `trial` \| `active` | `status = expired` | Marks the store as expired; login should be blocked or show expired messaging (see auth gate). |
| **Extend trial** | any non-operator store | set `trialEndsAt = now + N days` (default N = `APP_TRIAL_DAYS` or body `days`, clamp 1–90); if status was `expired`, set `trial` | Extends trial by N days from now. |
| **Reset owner password** | owner present | issue reset token; return `resetUrl` + `emailSent` + `mailConfigured` | Shows copy-link UI (same pattern as Settings → Users). |
| **Re-invite owner** | owner present | re-issue invite-style token **or** reset token if user already completed invite; prefer `issueResetLink` semantics for existing users | Copy-link; do not create a second user. |

**Forbidden in P0**

- Suspend / expire / change trial on the **platform operator** vendor (`APP_PLATFORM_OPERATOR_SLUG`, usually `demo`) — API returns 409/403 with clear message.
- Delete vendor, change subdomain, impersonate, edit Odoo credentials.

### 3. Signup result (light touch)

- After successful `POST /api/admin/tenants` or public signup redirect, prefer landing on `/platform/stores/{vendorId}` when on `app.*` (admin path). Public signup may keep bootstrap to `{slug}.*`.
- On provision failure, surface API message on `/signup`; no silent redirect. (No new “retry queue” in P0.)

## API

All routes: `@PreAuthorize("hasAuthority('ROLE_ADMIN')")` + `platformAccess.requirePlatformAdmin()`.

### Existing

```
GET  /api/admin/tenants
GET  /api/admin/tenants/{id}
POST /api/admin/tenants
```

### Add

```
PATCH /api/admin/tenants/{id}/status
Body: { "status": "active" | "suspended" | "expired" | "trial" }
→ 200 detail map (same shape as GET)

PATCH /api/admin/tenants/{id}/trial
Body: { "days": number }   // required, 1..90; extends from max(now, current trialEndsAt) OR from now — **choose: from now** for ops clarity
→ 200 detail map including new trialEndsAt + status (set to trial if was expired)

POST /api/admin/tenants/{id}/owner/reset-password
→ 200 { resetUrl, emailSent, mailConfigured, owner: { id, username, email } }

POST /api/admin/tenants/{id}/owner/reinvite
→ 200 { inviteUrl or resetUrl, emailSent, mailConfigured, owner }
  // Prefer reset for users who already set a password; invite token only if pendingPasswordReset / never completed
```

### Persistence

- Add `VendorMapper.updateTrialEndsAt(id, trialEndsAt)` (and optionally combine status+trial in one update for extend-from-expired).
- Reuse `updateStatus`.
- Owner reset: new method on `AccountLifecycleService` that loads owner via `userMapper.findPrimaryByVendor(vendorId)`, **does not** require `CurrentUser.vendorId()` match; still requires platform admin. Reset URL must use **tenant store origin** (`tenantProperties.storeUrl(subdomain)/reset-password?...`), not `app.public-url` alone, so cookies land on the correct host.

### Auth gate (follow-up check, same P0 PR if cheap)

- When `vendor.status` is `suspended` or `expired`, tenant-host login / JWT refresh should fail with a stable code (e.g. 40323) and UI message. If not already enforced, include a minimal check in auth/tenant filter; document if deferred.

## Acceptance criteria

1. Platform admin opens Stores → clicks store name → sees detail with owner email and trial date.
2. Suspend → list badge updates; tenant login blocked (or documented deferral with ticket).
3. Extend trial by 14 days → `trialEndsAt` advances; GET detail matches.
4. Reset owner → UI shows copyable URL; completing reset on `{slug}.*` works.
5. Attempting lifecycle change on operator vendor is rejected.
6. Non–platform-operator on `app.*` still sees “Platform admin required”.
7. No Sell/Sidebar chrome on detail page.

## Implementation order

1. Mapper + PATCH status / trial + tests (`PlatformAccessService` / controller tests)
2. Owner reset/reinvite endpoints (store-origin URLs)
3. `/platform/stores/[id]` page + list link
4. Optional: login gate for suspended/expired
5. UAT notes under `docs/UAT_PLATFORM_STORES_*.json` (read-only + one write on a **non-demo** trial store only)

## Non-goals (P1+)

Platform operator CRUD, audit log table, billing, health panel, feature flags — see gap analysis P1/P2.
