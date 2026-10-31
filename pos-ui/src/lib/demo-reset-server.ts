import { NextRequest } from "next/server";
import { ACCESS_COOKIE, backendUrl } from "@/lib/server-auth";

export class DemoResetError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

/** Authorization is enforced by the existing backend platform boundary. */
export async function platformRequest(request: NextRequest, path: string, method = "GET", body?: unknown) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  if (host !== "app.orithos.com.au") throw new DemoResetError("Use the platform console to reset demo.", 403);
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) throw new DemoResetError("Sign in as a platform administrator.", 401);
  const response = await fetch(`${backendUrl().replace(/\/+$/, "")}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "X-Forwarded-Host": host, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) throw new DemoResetError("Platform access or store binding could not be verified.", response.status === 401 || response.status === 403 ? response.status : 502);
  return payload.data;
}

export async function demoStore(request: NextRequest) {
  const page = await platformRequest(request, "/api/admin/tenants?q=demo&size=100");
  const demo = page.items?.find((item: { subdomain: string }) => item.subdomain === "demo");
  if (!Number.isSafeInteger(demo?.id)) throw new DemoResetError("The demo store could not be identified.", 409);
  return platformRequest(request, `/api/admin/tenants/${demo.id}`);
}

export async function resetRpc(method: string, args: unknown[] = []) {
  const base = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  const username = process.env.ODOO_SERVICE_USERNAME?.trim();
  const password = process.env.ODOO_SERVICE_PASSWORD;
  if (!base || !base.startsWith("https://") || !username || !password || process.env.ODOO_DATABASE !== "aipos_uat") throw new DemoResetError("Sandbox service is not configured.", 503);
  const auth = await fetch(`${base}/web/session/authenticate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: "aipos_uat", login: username, password }, id: 1 }),
  });
  const authenticated = await auth.json().catch(() => null);
  const cookie = auth.headers.getSetCookie().find((value) => value.startsWith("session_id="))?.split(";")[0];
  if (!auth.ok || !authenticated?.result?.uid || !cookie) throw new DemoResetError("Sandbox service authentication failed.", 503);
  async function rpc(model: string, name: string, values: unknown[], kwargs = {}) {
    const response = await fetch(`${base}/web/dataset/call_kw`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie! }, cache: "no-store", signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method: name, args: values, kwargs }, id: 2 }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.error || result?.result === undefined) throw new DemoResetError("Sandbox operation could not be completed. Refresh its status before retrying.");
    return result.result;
  }
  if (method === "latest") {
    const ids = await rpc("orithos.demo.reset", "search", [[]], { limit: 1, order: "id desc" });
    return ids.length ? rpc("orithos.demo.reset", "public_status", [ids]) : null;
  }
  return rpc("orithos.demo.reset", method, args);
}
