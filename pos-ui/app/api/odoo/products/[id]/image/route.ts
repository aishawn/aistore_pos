import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const productId = Number((await context.params).id);
  if (!Number.isSafeInteger(productId) || productId < 1) return NextResponse.json({ message: "Invalid product" }, { status: 400 });
  const correlationId = request.headers.get("x-correlation-id");

  try {
    const baseUrl = odooBaseUrl();
    const infoResponse = await fetch(`${baseUrl}/web/session/get_session_info`, {
      method: "POST", headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const info = await infoResponse.json() as { result?: { uid?: number; user_context?: { allowed_company_ids?: number[] } }; error?: unknown };
    if (!infoResponse.ok || info.error || !info.result?.uid) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
    const sessionCompanies = await resolveOdooAllowedCompanyIds(sessionId, info.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanies);
    if (forced.error) return NextResponse.json({ message: forced.error }, { status: forced.status });
    if (!forced.companyIds.length) return NextResponse.json({ message: "No accessible Odoo company is mapped to this store." }, { status: 403 });

    const response = await fetch(`${baseUrl}/web/dataset/call_kw`, {
      method: "POST", headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call",
        params: {
          model: "product.product", method: "search_read",
          args: [[ ["id", "=", productId], ["company_id", "in", forced.companyIds] ]],
          kwargs: { fields: ["image_128"], limit: 1, context: odooCompanyContext(forced.companyIds) },
        }, id: Date.now(),
      }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as { result?: Array<{ image_128?: string | false }>; error?: { message?: string } };
    if (!response.ok || payload.error) return NextResponse.json({ message: "Odoo product image is unavailable" }, { status: 502 });
    const encoded = payload.result?.[0]?.image_128;
    if (!encoded || typeof encoded !== "string") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const bytes = Buffer.from(encoded, "base64");
    const contentType = bytes.subarray(0, 3).toString("hex") === "ffd8ff" ? "image/jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
      : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
    if (!contentType) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(bytes, { status: 200, headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
