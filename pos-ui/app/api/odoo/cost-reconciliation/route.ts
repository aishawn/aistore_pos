import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requireStoreAdmin, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { reconcileCosts, type CostAudit } from "@/lib/cost-reconciliation";
import { loadCostSnapshot } from "@/lib/cost-reconciliation-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const pending = new Set<number>();
async function context(request: NextRequest) {
  await requireStoreAdmin(request);
  const scope = await scopedOdoo(request);
  if (scope.companyIds.length !== 1 || !scope.binding || !scope.database) throw new OdooScopeError("A single store company and database are required.", 403);
  const { binding } = scope;
  if (binding.subdomain !== "skr" || binding.r2Prefix !== "shopfront/skr/" || binding.odooProvisionStatus !== "ready") throw new OdooScopeError("Verified receipt evidence is not configured for this store.", 422);
  return scope;
}
function directory(database: string | undefined, companyId: number) {
  // Hash environment identity; never allow user-provided paths or database names.
  const key = createHash("sha256").update(`${process.env.ODOO_BASE_URL}|${database}|${companyId}`).digest("hex");
  return path.join(process.cwd(), ".local", "cost-reconciliation", key);
}
function failure(error: unknown) {
  if (error instanceof OdooScopeError || error instanceof StoreAccessError) return json({ message: error.message }, error.status);
  console.error("Cost audit failed", { category: error instanceof Error ? error.name : "unknown" });
  return json({ message: "Could not capture a complete, stable cost audit. Retry, or choose a shorter date range." }, 502);
}
export async function GET(request: NextRequest) {
  try {
    const scope = await context(request), id = request.nextUrl.searchParams.get("batch");
    if (!id) return json({ enabled: true, companyId: scope.companyIds[0], store: scope.binding!.subdomain });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return json({ message: "Invalid audit batch" }, 400);
    let saved: { audit: CostAudit };
    try { saved = JSON.parse(await readFile(path.join(directory(scope.database, scope.companyIds[0]), `${id}.json`), "utf8")); }
    catch { return json({ message: "Audit batch is unavailable. Generate a new batch or use the downloaded evidence." }, 404); }
    if (saved.audit.companyId !== scope.companyIds[0] || saved.audit.store !== scope.binding!.subdomain) return json({ message: "Audit scope mismatch" }, 403);
    return json(saved.audit);
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ message: "Cross-origin requests are not allowed" }, 403);
  let locked: number | undefined;
  try {
    const scope = await context(request), companyId = scope.companyIds[0];
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["fromDay", "toDay", "limit"].includes(k)) || (body.limit !== undefined && body.limit !== 20 && body.limit !== 0)) return json({ message: "Invalid audit request" }, 400);
    for (const key of ["fromDay", "toDay"]) if (body[key] !== undefined && (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[key] as string))) return json({ message: "Invalid business date" }, 400);
    if (pending.has(companyId)) return json({ message: "An audit is already being captured for this store. Please wait." }, 409);
    pending.add(companyId); locked = companyId;
    const snapshot = await loadCostSnapshot(scope.rpc, { companyId, store: scope.binding!.subdomain, fromDay: body.fromDay as string | undefined, toDay: body.toDay as string | undefined, limit: body.limit === 0 ? 0 : 20 });
    const sourceHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"), id = randomUUID();
    const audit = reconcileCosts(snapshot, id, sourceHash), dir = directory(scope.database, companyId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ audit, snapshot }), { flag: "wx", mode: 0o600 });
    return json(audit);
  } catch (error) { return failure(error); }
  finally { if (locked !== undefined) pending.delete(locked); }
}
