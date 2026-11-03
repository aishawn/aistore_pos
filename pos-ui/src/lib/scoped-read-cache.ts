import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { snapshotRevision } from "./report-snapshots";
import type { TenantOdooBinding } from "./odoo-tenant-company";

const values = new Map<string, { expires: number; body: unknown }>();
const pending = new Map<string, Promise<unknown>>();

/** Call only after current authentication, authorization and company resolution. */
export async function scopedReadCache<T>(request: NextRequest, binding: TenantOdooBinding, parameters: unknown, run: () => Promise<T>): Promise<T> {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host).split(",")[0].trim().toLowerCase();
  const revision = await snapshotRevision({ database: process.env.ODOO_DATABASE || "unconfigured", vendorId: binding.vendorId, companyId: binding.odooCompanyId!, host, timezone: "UTC", sampleDataClearedAt: binding.sampleDataClearedAt ?? null });
  const key = createHash("sha256").update(JSON.stringify([process.env.ODOO_DATABASE, host, request.cookies.get("orithos_odoo_session")?.value,
    request.cookies.get("orithos_access_token")?.value, binding.vendorId, binding.odooCompanyId, binding.sampleDataClearedAt, parameters, revision])).digest("hex");
  const force = request.nextUrl.searchParams.get("refresh") === "true" || request.nextUrl.searchParams.get("validateSales") === "true";
  const old = values.get(key);
  if (!force && old && old.expires > Date.now()) return old.body as T;
  let flight = pending.get(key);
  if (!flight) {
    flight = run().then(body => {
      if (values.size >= 128) values.delete(values.keys().next().value!);
      if (request.nextUrl.searchParams.get("validateSales") !== "true") values.set(key, { body, expires: Date.now() + 300_000 });
      return body;
    }).finally(() => pending.delete(key));
    pending.set(key, flight);
  }
  return await flight as T;
}
