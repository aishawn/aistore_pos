import { NextRequest, NextResponse } from "next/server";
import { requireStoreAdmin, StoreAccessError } from "@/lib/store-access";
import { backendUrl } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import identity from "@/lib/build-identity.json";

export const dynamic = "force-dynamic";

/** Read-only, authenticated attestation of the actual target environment. */
export async function GET(request: NextRequest) {
  try {
    await requireStoreAdmin(request);
    const database = process.env.ODOO_DATABASE?.trim();
    const expected = process.env.ISOLATION_ODOO_DATABASE?.trim();
    const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/public/uat-context`, {
      headers: withRequestCorrelation({}, request),
      cache: "no-store", signal: AbortSignal.timeout(3_000),
    });
    const backend = response.ok ? await response.json() : null;
    const isolated = process.env.RUNTIME_ENVIRONMENT === "uat" && Boolean(database && expected)
      && database === expected && database !== "aipos"
      && backend?.isolated === true && backend.database === database;
    if (!isolated) return NextResponse.json({ isolated: false, message: "Both services must explicitly target the same dedicated UAT database." }, { status: 409 });
    return NextResponse.json({ isolated: true, database, frontendCommit: identity.commit, backendCommit: backend.commit }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ isolated: false, message: error instanceof StoreAccessError ? error.message : "Could not attest the UAT environment." }, {
      status: error instanceof StoreAccessError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
