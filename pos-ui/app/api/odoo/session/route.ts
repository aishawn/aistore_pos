import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { ACCESS_COOKIE, backendUrl, isSameOrigin } from "@/lib/server-auth";

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
    throw new Error("Odoo connection is not configured");
  }
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Odoo connection must use HTTPS");
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
  if (!response.ok) throw new Error("Odoo request failed");
  const payload = (await response.json()) as {
    result?: OdooSessionInfo;
    error?: { message?: string; data?: { message?: string } };
  };
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Odoo request failed");
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
  if (!response.ok) throw new Error("Odoo login failed");

  const payload = (await response.json()) as {
    result?: OdooSessionInfo;
    error?: { message?: string; data?: { message?: string } };
  };
  if (payload.error || !payload.result?.uid) {
    throw new Error("Odoo username or password is incorrect");
  }

  const sessionCookie = response.headers.getSetCookie().find((value) => /(?:^|;\s*)session_id=/.test(value));
  const sessionId = sessionCookie?.match(/(?:^|;\s*)session_id=([^;]+)/)?.[1];
  if (!sessionId) throw new Error("Odoo did not return a session");

  return { info: payload.result, sessionId };
}

function getServiceCredentials() {
  const username = process.env.ODOO_SERVICE_USERNAME?.trim();
  const password = process.env.ODOO_SERVICE_PASSWORD;
  return username && password ? { username, password } : null;
}

async function connectWithServiceAccount() {
  const credentials = getServiceCredentials();
  if (!credentials) return null;

  const session = await authenticateOdoo(credentials.username, credentials.password);
  return { ...session, user: await publicUser(session.info, session.sessionId) };
}

async function hasOrithosSession(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken) return false;

  try {
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { code?: number; data?: unknown };
    return payload.code === 0 && Boolean(payload.data);
  } catch {
    return false;
  }
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

async function publicUser(info: OdooSessionInfo, sessionId: string) {
  if (!info.uid || !info.username) throw new Error("Odoo session is not authenticated");
  return {
    id: String(info.uid),
    name: info.partner_display_name || info.name || info.username,
    username: info.username,
    isAdmin: false,
    allowedCompanyIds: await resolveOdooAllowedCompanyIds(sessionId, info),
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin login is not allowed" }, { status: 403 });
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
    const nextResponse = NextResponse.json({ user: await publicUser(session.info, session.sessionId) }, { status: 200 });
    nextResponse.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
    return nextResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    if (!(await hasOrithosSession(request))) return NextResponse.json({ user: null }, { status: 200 });
    try {
      const session = await connectWithServiceAccount();
      if (!session) return NextResponse.json({ user: null }, { status: 200 });
      const response = NextResponse.json({ user: session.user }, { status: 200 });
      response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
      return response;
    } catch {
      return NextResponse.json({ user: null }, { status: 200 });
    }
  }

  try {
    const info = await callOdoo("/web/session/get_session_info", {}, sessionId);
    if (!info.uid) throw new Error("Odoo session has expired");
    return NextResponse.json({ user: await publicUser(info, sessionId) }, { status: 200 });
  } catch {
    if (!(await hasOrithosSession(request))) {
      const response = NextResponse.json({ user: null }, { status: 200 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    try {
      const session = await connectWithServiceAccount();
      const response = NextResponse.json({ user: session?.user ?? null }, { status: 200 });
      if (session) response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions());
      else response.cookies.delete(SESSION_COOKIE);
      return response;
    } catch {
      const response = NextResponse.json({ user: null }, { status: 200 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin logout is not allowed" }, { status: 403 });
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    try {
      await callOdoo("/web/session/destroy", {}, sessionId);
    } catch {
      // The browser session is still cleared even if Odoo is already unreachable.
    }
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
