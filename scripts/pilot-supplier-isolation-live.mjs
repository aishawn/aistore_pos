import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const env = Object.fromEntries(fs.readFileSync(`${root}/.env`, "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const app = "https://app.orithos.com.au";
const slug = `codex-supplier-${Date.now().toString().slice(-10)}`;
const store = `https://${slug}.orithos.com.au`;
const evidence = { generatedAt: new Date().toISOString(), slug, checks: [] };

function cookies(response) { return (response.headers.getSetCookie?.() || []).map((v) => v.split(";")[0]).join("; "); }
async function json(response) { const text = await response.text(); try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; } }
function check(name, passed, detail = {}) { evidence.checks.push({ ...detail, name, status: passed ? "PASS" : "FAIL" }); console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail); }

let appCookies = "";
let vendorId = null;
try {
  let response = await fetch(`${app}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: app }, body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }) });
  let body = await json(response); appCookies = cookies(response);
  check("platform.login", response.ok && body.code === 0 && Boolean(appCookies), { httpStatus: response.status });
  if (!appCookies) throw new Error("platform login failed");

  const ownerUsername = `supplieruat${Date.now().toString().slice(-7)}`;
  response = await fetch(`${app}/api/admin/tenants`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: app, Cookie: appCookies },
    body: JSON.stringify({ organisationName: `Codex Supplier UAT ${slug}`, subdomain: slug, ownerName: "Supplier UAT Owner", username: ownerUsername, email: `${ownerUsername}@example.invalid`, password: `SupplierUAT-${Date.now()}-Safe`, phone: "0400000000", trialDays: 1, outlets: [{ name: "Main Store", registerCount: 1 }], dummyData: true }),
  });
  body = await json(response); vendorId = body.data?.vendorId;
  if (!vendorId) {
    const list = await fetch(`${app}/api/admin/tenants?page=1&size=100`, { headers: { Origin: app, Cookie: appCookies } });
    const listed = await json(list);
    vendorId = listed.data?.items?.find((item) => item.subdomain === slug)?.id;
  }
  check("tenant.create", response.ok && Boolean(vendorId), { httpStatus: response.status, vendorId, message: body.message });
  if (!vendorId) throw new Error("tenant was not created");

  let detail;
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    response = await fetch(`${app}/api/admin/tenants/${vendorId}`, { headers: { Origin: app, Cookie: appCookies } });
    detail = await json(response);
    const binding = detail.data?.odooBinding || detail.data || {};
    console.log("provision", attempt, binding.odooProvisionStatus, binding.odooCompanyId);
    if (binding.odooProvisionStatus === "ready") break;
  }
  const binding = detail.data?.odooBinding || detail.data || {};
  check("tenant.provision.ready", binding.odooProvisionStatus === "ready", { companyId: binding.odooCompanyId, status: binding.odooProvisionStatus });
  if (binding.odooProvisionStatus !== "ready") throw new Error("provisioning failed");

  response = await fetch(`${app}/api/admin/tenants/${vendorId}/owner/bootstrap`, { method: "POST", headers: { Origin: app, Cookie: appCookies } });
  body = await json(response); const token = body.data?.bootstrapToken;
  check("owner.bootstrap", response.ok && Boolean(token), { httpStatus: response.status });
  if (!token) throw new Error("bootstrap token unavailable");
  response = await fetch(`${store}/api/auth/bootstrap`, { method: "POST", headers: { "Content-Type": "application/json", Origin: store }, body: JSON.stringify({ token }) });
  body = await json(response); let storeCookies = cookies(response);
  check("store.bootstrap", response.ok && body.code === 0 && Boolean(storeCookies), { httpStatus: response.status });
  if (!storeCookies) throw new Error("store bootstrap failed");
  const auth = { Origin: store, Cookie: storeCookies };
  response = await fetch(`${store}/api/odoo/session`, { headers: auth });
  storeCookies = [storeCookies, cookies(response)].filter(Boolean).join("; ");
  auth.Cookie = storeCookies;
  check("odoo.session", response.ok, { httpStatus: response.status });

  response = await fetch(`${store}/api/odoo/suppliers`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Invalid Supplier", email: "not-an-email" }) });
  body = await json(response); check("supplier.invalidEmail", response.status === 400, { httpStatus: response.status, message: body.message });
  const vat = `AU-UAT-${Date.now()}`;
  response = await fetch(`${store}/api/odoo/suppliers`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Codex UAT Distributor", email: "supplier@example.invalid", vat, phone: "0400000000", ref: "UAT" }) });
  body = await json(response); const supplierId = body.id;
  check("supplier.create", response.status === 201 && Number.isSafeInteger(supplierId), { httpStatus: response.status, supplierId, name: body.name });
  response = await fetch(`${store}/api/odoo/suppliers`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Duplicate Distributor", email: "duplicate@example.invalid", vat }) });
  body = await json(response); check("supplier.duplicateVat", response.status === 409, { httpStatus: response.status, message: body.message });
  evidence.companyId = binding.odooCompanyId; evidence.supplierId = supplierId; evidence.vat = vat;

  if (supplierId) {
    const base = (env.ODOO_BASE_URL || "https://odoo.orithos.com.au").replace(/\/+$/, "");
    const odooAuth = await fetch(`${base}/web/session/authenticate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: env.ODOO_DATABASE || "aipos", login: env.ODOO_SERVICE_USERNAME || env.ODOO_USER, password: env.ODOO_SERVICE_PASSWORD || env.ODOO_PASS }, id: Date.now() }) });
    const odooBody = await json(odooAuth); const sid = (odooAuth.headers.getSetCookie?.() || []).map((v) => v.split(";")[0]).find((v) => v.startsWith("session_id="));
    const read = await fetch(`${base}/web/dataset/call_kw`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sid }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: "res.partner", method: "search_read", args: [[ ["id", "=", supplierId], ["company_id", "=", binding.odooCompanyId] ]], kwargs: { fields: ["id", "name", "company_id", "vat"], limit: 1, context: { allowed_company_ids: [binding.odooCompanyId], force_company: binding.odooCompanyId } } }, id: Date.now() }) });
    const readBody = await json(read); const row = readBody.result?.[0];
    check("supplier.companyReadback", row?.company_id?.[0] === binding.odooCompanyId && row?.vat === vat, { companyId: row?.company_id?.[0], supplierId: row?.id, vat: row?.vat });
  }
} finally {
  if (vendorId && appCookies) {
    const response = await fetch(`${app}/api/admin/tenants/${vendorId}`, { method: "DELETE", headers: { Origin: app, Cookie: appCookies } });
    const body = await json(response); check("tenant.delete", response.ok && body.code === 0, { httpStatus: response.status, status: body.data?.status });
    const deleted = await fetch(`${store}/api/auth/me`, { headers: { Origin: store } }); check("deleted.auth", deleted.status === 402 || deleted.status === 401, { httpStatus: deleted.status });
  }
  fs.writeFileSync(`${root}/docs/UAT_SUPPLIER_ISOLATION_LIVE_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(evidence, null, 2));
}
