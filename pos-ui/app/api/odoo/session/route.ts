import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

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

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

function publicUser(info: OdooSessionInfo) {
  if (!info.uid || !info.username) throw new Error("Odoo session is not authenticated");
  return {
    id: String(info.uid),
    name: info.partner_display_name || info.name || info.username,
    username: info.username,
    isAdmin: false,
    allowedCompanyIds: info.user_context?.allowed_company_ids ?? [],
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
    const { baseUrl, database } = getOdooConfig();
    const response = await fetch(`${baseUrl}/web/session/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { db: database, login: username, password: body.password },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return NextResponse.json({ message: "Odoo login failed" }, { status: 401 });
    }

    const payload = (await response.json()) as {
      result?: OdooSessionInfo;
      error?: { message?: string; data?: { message?: string } };
    };
    if (payload.error || !payload.result?.uid) {
      return NextResponse.json({ message: "Odoo username or password is incorrect" }, { status: 401 });
    }

    const setCookies = response.headers.getSetCookie();
    const sessionCookie = setCookies.find((value) => /(?:^|;\s*)session_id=/.test(value));
    const sessionId = sessionCookie?.match(/(?:^|;\s*)session_id=([^;]+)/)?.[1];
    if (!sessionId) {
      return NextResponse.json({ message: "Odoo did not return a session" }, { status: 502 });
    }

    const nextResponse = NextResponse.json({ user: publicUser(payload.result) }, { status: 200 });
    nextResponse.cookies.set(SESSION_COOKIE, sessionId, cookieOptions());
    return nextResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ user: null }, { status: 200 });

  try {
    const info = await callOdoo("/web/session/get_session_info", {}, sessionId);
    return NextResponse.json({ user: info.uid ? publicUser(info) : null }, { status: 200 });
  } catch {
    const response = NextResponse.json({ user: null }, { status: 200 });
    response.cookies.delete(SESSION_COOKIE);
    return response;
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
