import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { StoreAccessError, requirePermission } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Company = { id: number; name?: string; partner_id?: [number, string] | false; currency_id?: [number, string] | false; street?: string | false; city?: string | false; zip?: string | false; phone?: string | false; email?: string | false; vat?: string | false; tz?: string };

function errorResponse(error: unknown) {
  const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
  const code = error instanceof OdooScopeError ? error.code : "COMPANY_SETTINGS_UNAVAILABLE";
  const message = status === 401
    ? "Your Odoo session has expired. Sign in again and retry."
    : status === 403
      ? "You do not have permission to view company settings. Contact a store administrator."
      : status === 404
        ? "This store is not linked to an Odoo company yet."
        : status >= 500
          ? "Company details are temporarily unavailable. Retry in a moment."
          : error instanceof Error ? error.message : "Company settings are unavailable.";
  return NextResponse.json({ message, code }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "settings.view");
    const scope = await scopedOdoo(request);
    // Odoo stores timezone on users, not res.company. Keep it out of this
    // company RPC until a tenant-level settings field is available.
    const rows = await scope.rpc<Company[]>("res.company", "search_read", [[["id", "in", scope.companyIds]]], { fields: ["id", "name", "partner_id", "currency_id", "street", "city", "zip", "phone", "email", "vat"], limit: 1 });
    const company = rows[0];
    if (!company) return NextResponse.json({ message: "No company is linked to this store." }, { status: 404 });
    return NextResponse.json({ code: 0, message: "ok", data: company }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission(request, "settings.store");
    const scope = await scopedOdoo(request);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
    const vat = typeof body.vat === "string" ? body.vat.trim().slice(0, 32) : "";
    const street = typeof body.street === "string" ? body.street.trim().slice(0, 160) : "";
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
    const zip = typeof body.zip === "string" ? body.zip.trim().slice(0, 16) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 160) : "";
    if (!name) return NextResponse.json({ message: "Company name is required." }, { status: 400 });
    if (body.currency && body.currency !== "AUD") return NextResponse.json({ message: "AUD is the only supported store currency." }, { status: 422 });
    await scope.rpc<boolean>("res.company", "write", [scope.companyIds, { name, vat: vat || false, street: street || false, city: city || false, zip: zip || false, phone: phone || false, email: email || false }]);
    return NextResponse.json({ code: 0, message: "ok", data: { ok: true } });
  } catch (error) { return errorResponse(error); }
}
