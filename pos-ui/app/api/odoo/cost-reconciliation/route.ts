import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { requireStoreAdmin, StoreAccessError } from "@/lib/store-access";
import { isSameOrigin } from "@/lib/server-auth";
import { reconcileCosts, type CostAudit } from "@/lib/cost-reconciliation";
import { loadCostSnapshot } from "@/lib/cost-reconciliation-source";
import { shopfrontSourceMargin } from "@/lib/shopfront-source-margin";
import { verifiedShopfrontSourceStore, verifiedShopfrontSourceStoreFromHost } from "@/lib/shopfront-store-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
type AuditJob = { id: string; companyId: number; store: string; requestKey: string; status: "running" | "completed" | "failed"; message?: string };
const jobs = new Map<string, AuditJob>();
const activeByScope = new Map<string, string>();
async function context(request: NextRequest) {
  await requireStoreAdmin(request);
  const scope = await scopedOdoo(request);
  if (scope.companyIds.length !== 1 || !scope.binding || !scope.database) throw new OdooScopeError("A single store company and database are required.", 403);
  const { binding } = scope;
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  const sourceStore = verifiedShopfrontSourceStore(binding) ?? verifiedShopfrontSourceStoreFromHost(host);
  if (!sourceStore) throw new OdooScopeError("Verified receipt evidence is not configured for this store.", 422);
  return { ...scope, sourceStore };
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
    const jobId = request.nextUrl.searchParams.get("job");
    if (jobId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) return json({ message: "Invalid audit job" }, 400);
      const job = jobs.get(jobId);
      if (!job) return json({ message: "Audit job expired or the service restarted. Generate a new audit." }, 404);
      if (job.companyId !== scope.companyIds[0] || job.store !== scope.binding!.subdomain) return json({ message: "Audit scope mismatch" }, 403);
      if (job.status === "completed") {
        try {
          const saved: { audit: CostAudit } = JSON.parse(await readFile(path.join(directory(scope.database, job.companyId), `${jobId}.json`), "utf8"));
          return json({ jobId, status: job.status, audit: saved.audit });
        } catch { return json({ message: "Completed audit evidence is unavailable. Generate a new audit." }, 404); }
      }
      if (job.status === "failed") return json({ jobId, status: job.status, message: job.message });
      return json({ jobId, status: job.status });
    }
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
  try {
    const scope = await context(request), companyId = scope.companyIds[0];
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).some(k => !["fromDay", "toDay", "limit"].includes(k)) || (body.limit !== undefined && body.limit !== 20 && body.limit !== 0)) return json({ message: "Invalid audit request" }, 400);
    for (const key of ["fromDay", "toDay"]) if (body[key] !== undefined && (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body[key] as string))) return json({ message: "Invalid business date" }, 400);
    const activeKey = `${companyId}:${scope.binding!.subdomain}:${scope.sourceStore}`;
    const requestKey = JSON.stringify({ fromDay: body.fromDay ?? null, toDay: body.toDay ?? null, limit: body.limit === 0 ? 0 : 20 });
    const activeJobId = activeByScope.get(activeKey);
    if (activeJobId) {
      const activeJob = jobs.get(activeJobId);
      if (activeJob?.requestKey === requestKey) return json({ jobId: activeJobId, status: "running" }, 202);
      return json({ message: "Another cost audit is running for this store. Wait for it to finish before changing the range." }, 409);
    }
    while (jobs.size >= 20) {
      const finished = [...jobs.values()].find(candidate => candidate.status !== "running");
      if (!finished) break;
      jobs.delete(finished.id);
    }
    const jobId = randomUUID();
    const job: AuditJob = { id: jobId, companyId, store: scope.binding!.subdomain, requestKey, status: "running" };
    jobs.set(jobId, job);
    activeByScope.set(activeKey, jobId);
    const options = { companyId, store: scope.binding!.subdomain, sourceStore: scope.sourceStore,
      fromDay: body.fromDay as string | undefined, toDay: body.toDay as string | undefined, limit: body.limit === 0 ? 0 as const : 20 as const };
    const db = scope.database;
    void (async () => {
      try {
        const snapshot = await loadCostSnapshot(scope.rpc, options);
        const sourceHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
        const audit = reconcileCosts(snapshot, jobId, sourceHash), dir = directory(db, companyId);
        audit.sourceMargin = shopfrontSourceMargin(snapshot.sourceSales ?? [], snapshot.from, snapshot.to, snapshot.coverage?.sourceRowsComplete === true);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await writeFile(path.join(dir, `${jobId}.json`), JSON.stringify({ audit, snapshot }), { flag: "wx", mode: 0o600 });
        job.status = "completed";
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        console.error("Cost audit failed", { category: error instanceof Error ? error.name : "unknown", code: /^[A-Z_]{2,30}$/.test(code) ? code : undefined });
        job.message = error instanceof Error && /Choose between|safe snapshot limit|Narrow the date range/i.test(error.message)
          ? error.message
          : "Could not capture a complete, stable cost audit. Retry, or choose a shorter date range.";
        job.status = "failed";
      } finally {
        if (activeByScope.get(activeKey) === jobId) activeByScope.delete(activeKey);
      }
    })();
    return json({ jobId, status: "running" }, 202);
  } catch (error) { return failure(error); }
}
