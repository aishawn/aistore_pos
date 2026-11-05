import assert from "node:assert/strict";
import test from "node:test";
import { companyReportRpc } from "./report-odoo.ts";

test("companyReportRpc carries the tenant warehouse into Odoo context", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.ODOO_BASE_URL;
  let request: { params: { kwargs: { context: Record<string, unknown> } } } | null = null;
  process.env.ODOO_BASE_URL = "https://odoo.test";
  globalThis.fetch = (async (_input, init) => {
    request = JSON.parse(String(init?.body)) as typeof request;
    return new Response(JSON.stringify({ result: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const rpc = companyReportRpc(5, undefined, 42);
    await rpc("session", "product.product", "search_read", [[]], { context: { tz: "Australia/Adelaide" } });
    assert.deepEqual(request?.params.kwargs.context, {
      tz: "Australia/Adelaide",
      allowed_company_ids: [5],
      force_company: 5,
      warehouse: 42,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.ODOO_BASE_URL;
    else process.env.ODOO_BASE_URL = originalBaseUrl;
  }
});
