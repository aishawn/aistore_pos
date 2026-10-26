import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { hasOrithosSession, isSameOrigin, REFRESH_COOKIE } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const SESSION_MAX_AGE = 8 * 60 * 60;

type OdooSessionInfo = {
  uid?: number;
  name?: string;
  username?: string;
  partner_display_name?: string;
  user_context?: { allowed_company_ids?: number[] };
};

function getOdooConfig() {
  const baseUrl = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  const database = process.env.ODOO_DATABASE?.trim();
  if (!baseUrl || !database) {
    throw new Error("Orithos connection is not configured");
  }
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Orithos connection must use HTTPS");
  }
  return { baseUrl, database };
}

async function callOdoo(
  path: string,
  params: Record<string, unknown>,
  sessionId?: string,
) {
  const { baseUrl } = getOdooConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { Cookie: `session_id=${sessionId}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Orithos request failed");
  const payload = (await response.json()) as {
    result?: OdooSessionInfo;
    error?: { message?: string; data?: { message?: string } };
  };
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Orithos request failed");
  }
  return payload.result ?? {};
}

async function authenticateOdoo(username: string, password: string) {
  const { baseUrl, database } = getOdooConfig();
  const response = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db: database, login: username, password },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  let payload: {
    result?: OdooSessionInfo;
    error?: { message?: string; data?: { message?: string } };
  } | null = null;
  try {
    payload = await response.json() as typeof payload;
  } catch {
    // Odoo proxies can return an HTML 502 while the web login endpoint remains healthy.
  }
  if (response.ok && payload?.result?.uid) {
    const sessionCookie = response.headers.getSetCookie().find((value) => /(?:^|;\s*)session_id=/.test(value));
    const sessionId = sessionCookie?.match(/(?:^|;\s*)session_id=([^;]+)/)?.[1];
    if (sessionId) return { info: payload.result, sessionId };
  }
  if (payload?.error && /access|password|credential|login|authentication/i.test(`${payload.error.message ?? ""} ${payload.error.data?.message ?? ""}`)) {
    throw new Error("Orithos username or password is incorrect");
  }

  return authenticateOdooWebLogin(baseUrl, database, username, password);
}

async function authenticateOdooWebLogin(baseUrl: string, database: string, username: string, password: string) {
  const loginPage = await fetch(`${baseUrl}/web/login?db=${encodeURIComponent(database)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!loginPage.ok) throw new Error("Orithos login failed");
  const html = await loginPage.text();
  const csrfToken = html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)/i)?.[1];
  if (!csrfToken) throw new Error("Orithos login failed");
  const initialCookies = loginPage.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  const form = new URLSearchParams({ csrf_token: csrfToken, login: username, password, type: "password", redirect: "" });
  const loginResponse = await fetch(`${baseUrl}/web/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(initialCookies ? { Cookie: initialCookies } : {}),
    },
    body: form,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const sessionCookie = loginResponse.headers.getSetCookie().find((value) => /(?:^|;\s*)session_id=/.test(value))
    ?? initialCookies.split("; ").find((value) => value.startsWith("session_id="));
  const sessionId = sessionCookie?.match(/(?:^|;\s*)session_id=([^;]+)/)?.[1];
  if (!sessionId || loginResponse.status < 300 || loginResponse.status >= 400) {
    throw new Error("Orithos username or password is incorrect");
  }
  const infoResponse = await fetch(`${baseUrl}/web/session/get_session_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!infoResponse.ok) throw new Error("Orithos login failed");
  const infoPayload = await infoResponse.json() as { result?: OdooSessionInfo; error?: unknown };
  if (infoPayload.error || !infoPayload.result?.uid) throw new Error("Orithos username or password is incorrect");
  return { info: infoPayload.result, sessionId };
}

function getServiceCredentials() {
  const username = process.env.ODOO_SERVICE_USERNAME?.trim();
  const password = process.env.ODOO_SERVICE_PASSWORD;
  return username && password ? { username, password } : null;
}

async function connectWithServiceAccount(request: NextRequest) {
  const credentials = getServiceCredentials();
  if (!credentials) return null;

  const session = await authenticateOdoo(credentials.username, credentials.password);
  return { ...session, user: await publicUser(session.info, session.sessionId, request) };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

async function publicUser(info: OdooSessionInfo, sessionId: string, request?: NextRequest) {
  if (!info.uid || !info.username) throw new Error("Orithos session is not authenticated");
  const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, info);
  let allowedCompanyIds = sessionCompanyIds;
  if (request) {
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    // Surface binding failures as an empty company list so the UI does not imply
    // access to every company on the shared service account.
    allowedCompanyIds = forced.error ? [] : forced.companyIds;
  }
  return {
    id: String(info.uid),
    name: info.partner_display_name || info.name || info.username,
    username: info.username,
    isAdmin: false,
    allowedCompanyIds,
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin login is not allowed" }, { status: 403 });
  }
  if (!(await hasOrithosSession(request))) {
    return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid login request" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username || !body.password) {
    return NextResponse.json({ message: "Username and password are required" }, { status: 400 });
  }
  if (username.length > 120 || body.password.length > 256) {
    return NextResponse.json({ message: "Username or password is too long" }, { status: 400 });
  }

  try {
    const session = await authenticateOdoo(username, body.password);
    const nextResponse = NextResponse.json({ user: await publicUser(session.info, session.sessionId, request) }, { status: 200 });
    nextResponse.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
    return nextResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

function sessionPayload(user: Awaited<ReturnType<typeof publicUser>> | null) {
  return {
    user,
    /** True when Dokploy/server has ODOO_SERVICE_* set (password never exposed). */
    autoRecoverConfigured: Boolean(getServiceCredentials()),
  };
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "development" && request.cookies.get("orithos_local_preview")?.value === "1") {
    return NextResponse.json({
      user: { id: "local-preview", name: "Local Preview", username: "preview", isAdmin: true, allowedCompanyIds: [1] },
      autoRecoverConfigured: false,
      localPreview: true,
    });
  }
  if (!(await hasOrithosSession(request))) {
    const response = NextResponse.json(sessionPayload(null), {
      status: request.cookies.get(REFRESH_COOKIE)?.value ? 401 : 200,
    });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    try {
      const session = await connectWithServiceAccount(request);
      if (!session) return NextResponse.json(sessionPayload(null), { status: 200 });
      const response = NextResponse.json(sessionPayload(session.user), { status: 200 });
      response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
      return response;
    } catch {
      return NextResponse.json(sessionPayload(null), { status: 200 });
    }
  }

  try {
    const info = await callOdoo("/web/session/get_session_info", {}, sessionId);
    if (!info.uid) throw new Error("Orithos session has expired");
    return NextResponse.json(sessionPayload(await publicUser(info, sessionId, request)), { status: 200 });
  } catch {
    try {
      const session = await connectWithServiceAccount(request);
      const response = NextResponse.json(sessionPayload(session?.user ?? null), { status: 200 });
      if (session) response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
      else response.cookies.delete(SESSION_COOKIE);
      return response;
    } catch {
      const response = NextResponse.json(sessionPayload(null), { status: 200 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin logout is not allowed" }, { status: 403 });
  }
  if (!(await hasOrithosSession(request))) {
    const response = NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    try {
      await callOdoo("/web/session/destroy", {}, sessionId);
    } catch {
      // The browser session is still cleared even if Orithos is already unreachable.
    }
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
