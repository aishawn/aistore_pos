import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

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
    return NextResponse.json({ message: "Invalid supplier request" }, { status: 400 });
  }
  const allowed = new Set(["name", "phone", "email", "vat", "ref"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return NextResponse.json({ message: "This supplier request contains unsupported fields" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const vat = typeof body.vat === "string" ? body.vat.trim() : "";
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ message: "Supplier name is required and must be 120 characters or fewer" }, { status: 400 });
  if (phone.length > 32 || email.length > 254 || vat.length > 32 || ref.length > 64) return NextResponse.json({ message: "Phone, email, ABN or reference is too long" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 });

  try {
    const headers = { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` };
    const duplicateCheck = vat ? await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: "res.partner", method: "search_read", args: [[ ["vat", "=", vat] ]], kwargs: { fields: ["id", "name", "supplier_rank"], limit: 1 } }, id: Date.now() }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    }) : null;
    if (duplicateCheck) {
      if (!duplicateCheck.ok) return NextResponse.json({ message: "Odoo supplier service is unavailable" }, { status: 502 });
      const duplicatePayload = await duplicateCheck.json() as { result?: Array<{ id: number; name: string; supplier_rank: number }>; error?: { message?: string } };
      if (duplicatePayload.error) {
        const detail = duplicatePayload.error.message ?? "";
        if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Odoo session has expired. Sign in to Odoo again." }, { status: 401 });
        if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Odoo account does not have permission to create suppliers." }, { status: 403 });
        return NextResponse.json({ message: "Odoo could not check for an existing ABN. No supplier was created." }, { status: 422 });
      }
      const duplicate = duplicatePayload.result?.[0];
      if (duplicate) return NextResponse.json({ message: `ABN / Tax ID already belongs to ${duplicate.name}${duplicate.supplier_rank > 0 ? " (existing supplier)" : " (existing contact)"}. Review that record before continuing.` }, { status: 409 });
    }

    const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST", headers,
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call",
        params: { model: "res.partner", method: "create", args: [{ name, type: "contact", company_type: "company", is_company: true, supplier_rank: 1, phone: phone || false, email: email || false, vat: vat || false, ref: ref || false }], kwargs: {} },
        id: Date.now(),
      }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Odoo supplier service is unavailable" }, { status: 502 });
    const payload = await response.json() as { result?: unknown; error?: { message?: string; data?: { name?: string } } };
    if (payload.error) {
      const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""}`;
      if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Odoo session has expired. Sign in to Odoo again." }, { status: 401 });
      if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Odoo account does not have permission to create suppliers." }, { status: 403 });
      return NextResponse.json({ message: "Odoo rejected this supplier. Check the details and your Odoo purchase permissions." }, { status: 422 });
    }
    if (!Number.isSafeInteger(payload.result) || Number(payload.result) < 1) return NextResponse.json({ message: "Odoo did not confirm the new supplier" }, { status: 502 });
    return NextResponse.json({ id: payload.result, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
