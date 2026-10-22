import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Many2One = [number, string] | false;

const CANDIDATE_MODELS = ["loyalty.card", "gift.card", "coupon.coupon"] as const;

async function detectGiftModel(scope: Awaited<ReturnType<typeof scopedOdoo>>) {
  for (const model of CANDIDATE_MODELS) {
    try {
      const found = await scope.rpc<Array<{ id: number; model: string; name: string }>>("ir.model", "search_read", [[["model", "=", model]]], {
        fields: ["id", "model", "name"],
        limit: 1,
      });
      if (found?.length) return found[0];
    } catch {
      // Try the next candidate when the model registry lookup is blocked.
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requireStoreAdmin(request);
    const scope = await scopedOdoo(request);
    const modelInfo = await detectGiftModel(scope);
    if (!modelInfo) {
      return NextResponse.json({
        available: false,
        module: null,
        message: "Gift cards require an Odoo Loyalty or Gift Card module. None of those models are installed on this database.",
        items: [],
        hasNext: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 40);
    const offsetRaw = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 40));
    const offset = Math.max(0, Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0);
    const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";

    if (modelInfo.model === "loyalty.card") {
      const domain: unknown[] = [];
      if (query) domain.push("|", ["code", "ilike", query], ["partner_id.name", "ilike", query]);
      type LoyaltyCard = {
        id: number;
        code: string;
        points: number;
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
      return NextResponse.json({
        available: true,
        module: modelInfo.model,
        items: page.map((row) => ({
          id: row.id,
          code: row.code,
          balance: Number(row.points) || 0,
          partner: Array.isArray(row.partner_id) ? row.partner_id[1] : null,
          program: Array.isArray(row.program_id) ? row.program_id[1] : null,
          expiry: row.expiration_date || null,
          status: row.expiration_date && new Date(row.expiration_date) < new Date() ? "expired" : "active",
        })),
        limit,
        offset,
        hasNext: (rows?.length ?? 0) > limit,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      available: true,
      module: modelInfo.model,
      message: `Detected ${modelInfo.name} (${modelInfo.model}). List mapping for this module is not implemented yet.`,
      items: [],
      hasNext: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo gift cards are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
