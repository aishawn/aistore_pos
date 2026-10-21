import { NextResponse } from "next/server";
import identity from "@/lib/build-identity.json";
import { backendUrl } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Image metadata, never runtime env overrides or a client-supplied SHA. */
export async function GET() {
  let backend: { service: string; commit: string | null; builtAt: string | null } | null = null;
  try {
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/public/version`, {
      cache: "no-store", signal: AbortSignal.timeout(3_000),
    });
    const payload = response.ok ? await response.json() : null;
    if (payload?.service === "orithos-backend") {
      backend = {
        service: payload.service,
        commit: /^[a-f0-9]{40}$/.test(payload.commit ?? "") ? payload.commit : null,
        builtAt: typeof payload.builtAt === "string" && Number.isFinite(Date.parse(payload.builtAt)) ? payload.builtAt : null,
      };
    }
  } catch { /* A missing backend must not masquerade as a verified deployment. */ }
  return NextResponse.json({ frontend: identity, backend }, {
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "no-store" },
  });
}
