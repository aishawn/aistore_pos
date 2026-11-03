import { withReportInvalidation } from "@/lib/report-write-invalidation";
import { companyDomain } from "@/lib/customer-access";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string) {
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

async function handlePATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.groups");
    const scope = await scopedOdoo(request);
    const groupId = parseId((await context.params).id);
    if (!groupId) return NextResponse.json({ message: "Invalid customer group ID" }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json() as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ message: "Invalid customer group request" }, { status: 400 });
    }
    if (Object.keys(body).some((key) => key !== "name")) {
      return NextResponse.json({ message: "This customer group request contains unsupported fields" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) {
      return NextResponse.json({ message: "Group name is required and must be 120 characters or fewer" }, { status: 400 });
    }

    const existing = await scope.rpc<Array<{ id: number }>>("res.partner.category", "search_read", [[["id", "=", groupId], ...companyDomain(scope.companyIds)]], {
      fields: ["id"],
      limit: 1,
    });
    if (!existing?.length) return NextResponse.json({ message: "Customer group was not found" }, { status: 404 });

    const ok = await scope.rpc<boolean>("res.partner.category", "write", [[groupId], { name }]);
    if (ok !== true) return NextResponse.json({ message: "Orithos did not confirm the customer group update" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos customer groups are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

async function handleDELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "customers.groups");
    const scope = await scopedOdoo(request);
    const groupId = parseId((await context.params).id);
    if (!groupId) return NextResponse.json({ message: "Invalid customer group ID" }, { status: 400 });

    const existing = await scope.rpc<Array<{ id: number }>>("res.partner.category", "search_read", [[["id", "=", groupId], ...companyDomain(scope.companyIds)]], {
      fields: ["id"],
      limit: 1,
    });
    if (!existing?.length) return NextResponse.json({ message: "Customer group was not found" }, { status: 404 });

    const used = await scope.rpc<number>("res.partner", "search_count", [[["category_id", "in", [groupId]]]], { active_test: false });
    if (used > 0) return NextResponse.json({ message: "This group is assigned to customers. Remove those assignments before deleting it." }, { status: 409 });
    const ok = await scope.rpc<boolean>("res.partner.category", "unlink", [[groupId]]);
    if (ok !== true) return NextResponse.json({ message: "Orithos did not confirm the customer group delete" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos customer groups are unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

export const PATCH = withReportInvalidation(handlePATCH);

export const DELETE = withReportInvalidation(handleDELETE);
