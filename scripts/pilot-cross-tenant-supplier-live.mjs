import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));

const APP = "https://app.orithos.com.au";
const evidence = { generatedAt: new Date().toISOString(), scope: "cross-company supplier rejection through purchase request", checks: [] };
const cookieHeader = (response) => (response.headers.getSetCookie?.() ?? [])
  .map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
const json = async (response) => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 400) }; }
};
const check = (name, passed, detail = {}) => {
  evidence.checks.push({ name, status: passed ? "PASS" : "FAIL", ...detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail);
  return passed;
};

let platformCookie = "";
const tenants = [];
let failed = false;

async function createTenant(label) {
  const suffix = `${Date.now()}${label}`;
  const slug = `codex-cross-${label.toLowerCase()}-${suffix.slice(-8)}`;
  const response = await fetch(`${APP}/api/admin/tenants`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: APP, Cookie: platformCookie },
    body: JSON.stringify({
      organisationName: `Codex Cross Tenant ${label} ${suffix}`, subdomain: slug,
      ownerName: `Cross Tenant ${label}`, username: `cross${label.toLowerCase()}${suffix.slice(-7)}`,
      email: `${slug}@example.invalid`, password: `CrossTenant-${suffix}-Safe`, phone: "0400000000",
      trialDays: 1, outlets: [{ name: "Main", registerCount: 1 }], dummyData: true,
    }),
  });
  const body = await json(response);
  const vendorId = body.data?.vendorId;
  failed ||= !check(`${label}.create`, response.status === 200 && Number.isSafeInteger(vendorId), { httpStatus: response.status, vendorId });
  if (!vendorId) throw new Error(`${label} tenant was not created`);
  const tenant = { label, vendorId, slug, store: `https://${slug}.orithos.com.au`, companyId: null, cookie: "" };
  tenants.push(tenant);

  let binding = {};
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const detailResponse = await fetch(`${APP}/api/admin/tenants/${vendorId}`, { headers: { Origin: APP, Cookie: platformCookie } });
    const detail = await json(detailResponse);
    binding = detail.data?.odooBinding || detail.data || {};
    if (binding.odooProvisionStatus === "ready") break;
  }
  tenant.companyId = binding.odooCompanyId ?? null;
  failed ||= !check(`${label}.provision.ready`, binding.odooProvisionStatus === "ready", { provisionStatus: binding.odooProvisionStatus, companyId: tenant.companyId });
  if (binding.odooProvisionStatus !== "ready") throw new Error(`${label} provisioning failed`);

  const bootstrapResponse = await fetch(`${APP}/api/admin/tenants/${vendorId}/owner/bootstrap`, { method: "POST", headers: { Origin: APP, Cookie: platformCookie } });
  const bootstrap = await json(bootstrapResponse);
  const storeResponse = await fetch(`${tenant.store}/api/auth/bootstrap`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: tenant.store },
    body: JSON.stringify({ token: bootstrap.data?.bootstrapToken }),
  });
  tenant.cookie = cookieHeader(storeResponse);
  const storeBody = await json(storeResponse);
  failed ||= !check(`${label}.bootstrap`, bootstrapResponse.ok && storeResponse.ok && storeBody.code === 0 && Boolean(tenant.cookie), { bootstrapStatus: bootstrapResponse.status, storeStatus: storeResponse.status });
  if (!tenant.cookie) throw new Error(`${label} bootstrap failed`);

  const sessionResponse = await fetch(`${tenant.store}/api/odoo/session`, { headers: { Origin: tenant.store, Cookie: tenant.cookie } });
  tenant.cookie = [tenant.cookie, cookieHeader(sessionResponse)].filter(Boolean).join("; ");
  failed ||= !check(`${label}.odoo.session`, sessionResponse.ok, { httpStatus: sessionResponse.status });
  return tenant;
}

try {
  const login = await fetch(`${APP}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: APP },
    body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }),
  });
  platformCookie = cookieHeader(login);
  const loginBody = await json(login);
  failed ||= !check("platform.login", login.ok && loginBody.code === 0 && Boolean(platformCookie), { httpStatus: login.status });
  if (!platformCookie) throw new Error("platform login failed");

  const tenantA = await createTenant("A");
  const tenantB = await createTenant("B");
  failed ||= !check("companies.are.distinct", tenantA.companyId && tenantB.companyId && tenantA.companyId !== tenantB.companyId, { companyA: tenantA.companyId, companyB: tenantB.companyId });

  const vat = `AU-CROSS-${Date.now()}`;
  const supplierResponse = await fetch(`${tenantA.store}/api/odoo/suppliers`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: tenantA.store, Cookie: tenantA.cookie },
    body: JSON.stringify({ name: `Tenant A Only ${vat}`, email: `a-${vat}@example.invalid`, vat, ref: "CODEX-CROSS-UAT" }),
  });
  const supplierBody = await json(supplierResponse);
  const supplierId = supplierBody.id;
  failed ||= !check("a.supplier.create", supplierResponse.status === 201 && Number.isSafeInteger(supplierId), { httpStatus: supplierResponse.status, supplierId });

  const planResponse = await fetch(`${tenantB.store}/api/odoo/replenishment?coverageDays=21`, { headers: { Origin: tenantB.store, Cookie: tenantB.cookie } });
  const plan = await json(planResponse);
  const product = (plan.products || []).find((item) => Number.isSafeInteger(item.id));
  failed ||= !check("b.replenishment.read", planResponse.ok && product, { httpStatus: planResponse.status, productId: product?.id ?? null });
  if (product && supplierId) {
    const purchaseResponse = await fetch(`${tenantB.store}/api/odoo/purchase-requests`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: tenantB.store, Cookie: tenantB.cookie },
      body: JSON.stringify({ supplierId, coverageDays: 21, method: product.method, lines: [{ productId: product.id, quantity: 1, suggestedQuantity: product.suggestedQuantity, reason: product.reason }] }),
    });
    const purchaseBody = await json(purchaseResponse);
    failed ||= !check("b.cannot.use.a.supplier", purchaseResponse.status === 404, { httpStatus: purchaseResponse.status, message: purchaseBody.message });
  }
} catch (error) {
  failed = true;
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  for (const tenant of tenants.reverse()) {
    const response = await fetch(`${APP}/api/admin/tenants/${tenant.vendorId}`, { method: "DELETE", headers: { Origin: APP, Cookie: platformCookie } });
    const body = await json(response);
    check(`${tenant.label}.delete`, response.ok && body.code === 0, { httpStatus: response.status, tenantStatus: body.data?.status ?? null });
    const deletedAuth = await fetch(`${tenant.store}/api/auth/me`, { headers: { Origin: tenant.store } });
    check(`${tenant.label}.deleted.auth`, [401, 402].includes(deletedAuth.status), { httpStatus: deletedAuth.status });
  }
  evidence.status = failed || evidence.checks.some((item) => item.status === "FAIL") ? "FAIL" : "PASS";
  const outputPath = path.join(root, "docs", `UAT_CROSS_TENANT_SUPPLIER_LIVE_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: evidence.status }));
  if (evidence.status !== "PASS") process.exitCode = 1;
}
