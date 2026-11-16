/** Client/server helpers for {slug}.orithos.com.au multi-tenant hosts. */

const DEFAULT_BASE = "orithos.com.au";
/** Reserved infra hosts — not usable as store slugs. `demo` is the pilot store. */
const RESERVED = new Set([
  "www", "app", "api", "odoo", "cdn", "support", "mail", "status",
]);

export function tenantBaseDomain(): string {
  return (process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || DEFAULT_BASE).trim().toLowerCase();
}

/** Public brand-site trial signup (not the control-plane /signup wizard). */
export function brandSignupUrl(): string {
  return `https://${tenantBaseDomain()}/signup`;
}

export function normalizeSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = raw.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) return null;
  return slug;
}

export function isReservedSlug(slug: string | null): boolean {
  return !slug || RESERVED.has(slug);
}

/** Parse Host header / window.location.host → tenant slug or null (control plane). */
export function parseTenantSlugFromHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  let host = hostHeader.split(",")[0].trim().toLowerCase();
  const colon = host.indexOf(":");
  if (colon >= 0) host = host.slice(0, colon);
  const base = tenantBaseDomain();
  if (
    host === base
    || host === `www.${base}`
    || host === `app.${base}`
    || host === "localhost"
    || host === "127.0.0.1"
  ) {
    return null;
  }
  const suffix = `.${base}`;
  if (!host.endsWith(suffix) || host.length <= suffix.length) return null;
  const slug = host.slice(0, -suffix.length);
  if (slug.includes(".")) return null;
  const normalized = normalizeSlug(slug);
  if (!normalized || isReservedSlug(normalized)) return null;
  return normalized;
}

export function isControlPlaneHost(hostHeader: string | null | undefined): boolean {
  return parseTenantSlugFromHost(hostHeader) === null;
}

/** Auth + platform console pages allowed on app.* (no store POS chrome). */
export function isControlPlanePageAllowed(pathname: string): boolean {
  if (
    pathname === "/login"
    || pathname === "/signup"
    || pathname === "/forgot-password"
    || pathname === "/reset-password"
    || pathname === "/settings/account"
  ) {
    return true;
  }
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname === "/platform" || pathname.startsWith("/platform/")) return true;
  return false;
}

/** Parse and sanitize internal post-login return URLs (strip nested `next`, block auth routes). */
export function normalizeAuthReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const parsed = new URL(value, "https://orithos.invalid");
    if (
      parsed.pathname === "/login"
      || parsed.pathname === "/signup"
      || parsed.pathname === "/forgot-password"
      || parsed.pathname === "/reset-password"
      || parsed.pathname.startsWith("/auth/")
    ) {
      return null;
    }
    parsed.searchParams.delete("next");
    const search = parsed.searchParams.toString();
    return `${parsed.pathname}${search ? `?${search}` : ""}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** Build the value for `?next=` when sending an unauthenticated user to `/login`. */
export function loginQueryReturnPath(pathname: string, search = ""): string {
  return normalizeAuthReturnPath(`${pathname}${search}`) ?? pathname;
}

/** Safe post-login path on the control plane (never land on store Sell `/`). */
export function controlPlaneLandingPath(next: string | null | undefined): string {
  const safeNext = normalizeAuthReturnPath(next);
  if (safeNext && isControlPlanePageAllowed(safeNext.split("?")[0] || safeNext)) {
    return safeNext;
  }
  return "/platform/stores";
}

/** Default store web landing for administrators and managers. */
export const STORE_WEB_LANDING_PATH = "/dashboard";

/** Default store web landing for front-line staff (Sell register). */
export const STORE_STAFF_LANDING_PATH = "/sell";

function isStoreLeadership(user?: { isAdmin: boolean; roleCode?: string }): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  const code = (user.roleCode ?? "").trim().toUpperCase();
  return code === "ADMIN" || code === "MANAGER";
}

/** Safe post-login path on a store host. */
export function storeLandingPath(
  next: string | null | undefined,
  mode: "web" | "mobile" = "web",
  user?: { isAdmin: boolean; roleCode?: string },
): string {
  const safeNext = normalizeAuthReturnPath(next);
  if (safeNext && safeNext !== "/") {
    return safeNext;
  }
  if (mode === "mobile") return "/m";
  if (user && !isStoreLeadership(user)) return STORE_STAFF_LANDING_PATH;
  return STORE_WEB_LANDING_PATH;
}

export function storeOrigin(slug: string, protocol?: string): string {
  const scheme = protocol
    || process.env.NEXT_PUBLIC_TENANT_SCHEME
    || (typeof window !== "undefined" ? window.location.protocol.replace(":", "") : "https");
  return `${scheme}://${slug}.${tenantBaseDomain()}`;
}
