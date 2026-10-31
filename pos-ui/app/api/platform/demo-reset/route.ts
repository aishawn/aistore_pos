import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { demoStore, DemoResetError, platformRequest, resetRpc } from "@/lib/demo-reset-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => json({ message: error instanceof DemoResetError ? error.message : "Sandbox service is unavailable." }, error instanceof DemoResetError ? error.status : 502);

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ message: "Cross-origin request rejected." }, 403);
  try {
    const store = await demoStore(request);
    const job = await resetRpc("latest");
    return json({ store: { id: store.id, subdomain: store.subdomain, odooCompanyId: store.odooCompanyId }, job });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ message: "Cross-origin request rejected." }, 403);
  try {
    const store = await demoStore(request);
    const body = await request.json();
    if (body.action === "preview") return json({ preview: await resetRpc("preview"), store });
    if (body.action === "start") {
      if (body.confirm !== "REPLACE DEMO" || typeof body.requestKey !== "string" || !/^[a-f0-9-]{36}$/i.test(body.requestKey)) return json({ message: "Confirm REPLACE DEMO and supply a reset request key." }, 400);
      return json({ job: await resetRpc("enqueue", [body.requestKey, store]) }, 202);
    }
    if (body.action === "activate") {
      const job = await resetRpc("latest");
      if (!job || job.id !== body.jobId || !["ready", "active"].includes(job.state)) return json({ message: "The requested replica is not ready." }, 409);
      if (store.odooCompanyId !== job.previousBinding.odooCompanyId && store.odooCompanyId !== job.binding.odooCompanyId) return json({ message: "Demo binding changed. Review it before switching data." }, 409);
      if (store.odooCompanyId !== job.binding.odooCompanyId) {
        await platformRequest(request, `/api/admin/tenants/${store.id}/odoo-binding`, "PATCH", { ...job.binding, reason: `Owner-approved SKR sandbox reset ${job.id}; verified backup ${job.backup.sha256}` });
      }
      return json({ job: await resetRpc("activate", [[job.id]]) });
    }
    return json({ message: "Unknown sandbox action." }, 400);
  } catch (error) { return failure(error); }
}
