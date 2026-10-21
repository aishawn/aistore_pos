import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid customer request" }, { status: 400 });
  }
  const allowed = new Set(["name", "phone", "email", "ref"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return NextResponse.json({ message: "This customer request contains unsupported fields" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const reference = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ message: "Customer name is required and must be 120 characters or fewer" }, { status: 400 });
  if (phone.length > 32 || email.length > 254 || reference.length > 64) return NextResponse.json({ message: "Phone, email or reference is too long" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 });

  try {
    const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "create",
          args: [{ name, type: "contact", customer_rank: 1, phone: phone || false, email: email || false, ref: reference || false }],
          kwargs: {},
        },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Odoo customer service is unavailable" }, { status: 502 });
    const payload = await response.json() as { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
    if (payload.error) {
      const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""}`;
      if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Odoo session has expired. Sign in to Odoo again." }, { status: 401 });
      if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Odoo account does not have permission to create customers." }, { status: 403 });
      return NextResponse.json({ message: "Odoo rejected the customer record. Check that the contact details are valid." }, { status: 422 });
    }
    if (!Number.isSafeInteger(payload.result) || Number(payload.result) < 1) return NextResponse.json({ message: "Odoo did not confirm the new customer" }, { status: 502 });
    return NextResponse.json({ id: payload.result, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
