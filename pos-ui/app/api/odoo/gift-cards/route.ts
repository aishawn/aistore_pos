import { companyDomain } from "@/lib/customer-access";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

async function detectLoyaltyCard(scope: Awaited<ReturnType<typeof scopedOdoo>>) {
  try {
    await scope.rpc<number>("loyalty.card", "search_count", [[]]);
    return { model: "loyalty.card", name: "Loyalty Card" };
  } catch (error) {
    if (!(error instanceof OdooScopeError) || error.code !== "LOYALTY_NOT_INSTALLED") throw error;
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.gift_cards");
    const scope = await scopedOdoo(request);
    const modelInfo = await detectLoyaltyCard(scope);
    if (!modelInfo) {
      return NextResponse.json({
        available: false,
        state: "not_installed",
        module: null,
        message: "Gift cards live under Orithos Apps → search “Coupons & Loyalty” (module loyalty), then also install “Point of Sale - Coupons & Loyalty”. There is no separate app named Gift Card.",
        items: [],
        hasNext: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 40);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";

    const domain: unknown[] = [["program_id.program_type", "=", "gift_card"], ...companyDomain(scope.companyIds)];
    if (query) domain.push("|", ["code", "ilike", query], ["partner_id.name", "ilike", query]);

    type LoyaltyCard = {
      id: number;
      code: string;
      points: number;
      point_name?: string | false;
      partner_id: Many2One;
      program_id: Many2One;
      expiration_date: string | false;
    };

    const rows = await scope.rpc<LoyaltyCard[]>("loyalty.card", "search_read", [domain], {
      fields: ["id", "code", "points", "partner_id", "program_id", "expiration_date"],
      limit: limit + 1,
      offset,
      order: "id desc",
    });
    const page = (rows ?? []).slice(0, limit);

    const programs = await scope.rpc<Array<{ id: number; name: string; currency_id: Many2One }>>("loyalty.program", "search_read", [[
      ["program_type", "=", "gift_card"], ...companyDomain(scope.companyIds),
    ]], { fields: ["id", "name", "currency_id"], limit: 0 });
    const company = (await scope.rpc<Array<{ country_id: Many2One; state_id: Many2One }>>("res.company", "search_read", [[["id", "=", scope.companyIds[0]]]], { fields: ["country_id", "state_id"], limit: 1 }))[0];
    const timezone = getOdooCompanyTimezone(company?.country_id, company?.state_id);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return NextResponse.json({
      available: true,
      module: modelInfo.model,
      state: programs.length ? (page.length ? "ready" : "empty") : "unconfigured",
      message: programs.length
        ? `Orithos Loyalty is installed. Gift card program: ${programs.map((p) => p.name).join(", ")}.`
        : "Orithos Loyalty is installed. Create a Gift Card program in Orithos Sales/Loyalty if you need issued cards listed here.",
      items: page.map((row) => ({
        currency: (() => { const program = programs.find((p) => Array.isArray(row.program_id) && p.id === row.program_id[0]); return Array.isArray(program?.currency_id) ? program.currency_id[1] : null; })(),
        id: row.id,
        code: row.code,
        balance: Number(row.points) || 0,
        partner: Array.isArray(row.partner_id) ? row.partner_id[1] : null,
        program: Array.isArray(row.program_id) ? row.program_id[1] : null,
        expiry: row.expiration_date || null,
        status: row.expiration_date && row.expiration_date.slice(0, 10) < today ? "expired" : "active",
      })),
      limit,
      offset,
      hasNext: (rows?.length ?? 0) > limit,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos gift cards are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
