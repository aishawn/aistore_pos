import { NextRequest } from "next/server";
import { ACCESS_COOKIE, backendUrl } from "@/lib/server-auth";

export class StoreAccessError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export interface StoreMe {
  isAdmin?: boolean;
  roleCode?: string;
  permissions?: string[];
}

async function fetchStoreMe(request: NextRequest): Promise<StoreMe> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) throw new StoreAccessError("Orithos session expired.", 401);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) headers["X-Forwarded-Host"] = host.split(",")[0].trim();
  let response: Response;
  try {
    response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/auth/me`, {
      headers, cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
  } catch { throw new StoreAccessError("Could not verify your store permissions.", 503); }
  if (response.status === 401) throw new StoreAccessError("Orithos session expired.", 401);
  if (response.status === 403) throw new StoreAccessError("This account cannot access this store.", 403);
  if (!response.ok) throw new StoreAccessError("Could not verify your store permissions.", 503);
  const payload = await response.json().catch(() => null);
  if (payload?.code !== 0 || !payload.data) throw new StoreAccessError("Could not verify your store permissions.", 503);
  return payload.data as StoreMe;
}

/** Check the application role as well as the shared Odoo service account. */
export async function requireStoreAdmin(request: NextRequest) {
  const me = await fetchStoreMe(request);
  if (me.isAdmin !== true && me.roleCode !== "ADMIN") {
    throw new StoreAccessError("Store administrator access is required.", 403);
  }
  return me;
}

/** Require any of the given permission safe_names (admins always pass). */
export async function requirePermission(request: NextRequest, ...safeNames: string[]) {
  const me = await fetchStoreMe(request);
  if (me.isAdmin === true || me.roleCode === "ADMIN") return me;
  const granted = new Set(me.permissions ?? []);
  if (safeNames.some((name) => granted.has(name))) return me;
  throw new StoreAccessError("You do not have permission for this action.", 403);
}
