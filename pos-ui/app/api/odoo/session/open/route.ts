import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Orithos connection must use HTTPS");
  }
  return value;
}

async function openSession(sessionId: string, configId: number) {
  const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model: "pos.config", method: "open_ui", args: [[configId]], kwargs: {} },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Orithos POS is unavailable");
  const payload = await response.json() as {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Orithos could not open the POS session");
  }
  return payload.result ?? null;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });

  let body: { configId?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid POS session request" }, { status: 400 }); }
  const configId = Number(body.configId);
  if (!Number.isSafeInteger(configId) || configId <= 0) {
    return NextResponse.json({ message: "Choose a valid Orithos register" }, { status: 400 });
  }

  try {
    await openSession(sessionId, configId);
    return NextResponse.json({ opened: true, configId }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos could not open the POS session";
    const expired = /session|log in|authenticate/i.test(message);
    const status = expired ? 401 : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 409;
    const response = NextResponse.json({ message: expired ? "Orithos session expired" : message }, { status });
    if (expired) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}
