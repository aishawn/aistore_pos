import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.view", "customers.edit", "customers.groups", "customers.pricelists", "customers.balances", "customers.gift_cards", "settings.integrations");
    await scopedOdoo(request);
    const base = process.env.ODOO_BASE_URL!.trim().replace(/\/+$/, "");
    return NextResponse.json({ baseUrl: base }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Orithos is unavailable" }, { status: error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502 });
  }
}
