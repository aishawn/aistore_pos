import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requirePermission } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Company = { id: number; name?: string; partner_id?: [number, string] | false; currency_id?: [number, string] | false; street?: string | false; city?: string | false; zip?: string | false; phone?: string | false; email?: string | false; vat?: string | false; tz?: string };

function errorResponse(error: unknown) {
  const status = error instanceof OdooScopeError ? error.status : 502;
  return NextResponse.json({ message: error instanceof Error ? error.message : "Company settings are unavailable." }, { status });
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, "settings.view");
    const scope = await scopedOdoo(request);
    const rows = await scope.rpc<Company[]>("res.company", "search_read", [["id", "in", scope.companyIds]], { fields: ["id", "name", "partner_id", "currency_id", "street", "city", "zip", "phone", "email", "vat", "tz"], limit: 1 });
    const company = rows[0];
    if (!company) return NextResponse.json({ message: "No company is linked to this store." }, { status: 404 });
    return NextResponse.json(company, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission(request, "settings.store");
    const scope = await scopedOdoo(request);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
    const vat = typeof body.vat === "string" ? body.vat.trim().slice(0, 32) : "";
    const tz = typeof body.tz === "string" ? body.tz.trim().slice(0, 64) : "";
    if (!name || !tz) return NextResponse.json({ message: "Company name and timezone are required." }, { status: 400 });
    if (body.currency && body.currency !== "AUD") return NextResponse.json({ message: "AUD is the only supported store currency." }, { status: 422 });
    await scope.rpc<boolean>("res.company", "write", [scope.companyIds, { name, vat: vat || false, tz }]);
    return NextResponse.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
