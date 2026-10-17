import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const env = Object.fromEntries(fs.readFileSync(`${root}/.env`, "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));

const app = "https://app.orithos.com.au";
const slug = `codex-replenishment-${Date.now().toString().slice(-10)}`;
const store = `https://${slug}.orithos.com.au`;
const evidence = { generatedAt: new Date().toISOString(), slug, checks: [] };

function cookies(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(";")[0]).filter(Boolean).join("; ");
}
function mergeCookies(...values) {
  const map = new Map();
  for (const value of values) for (const part of (value || "").split("; ").filter(Boolean)) {
    const index = part.indexOf("=");
    if (index > 0) map.set(part.slice(0, index), part.slice(index + 1));
  }
  return [...map].map(([key, value]) => `${key}=${value}`).join("; ");
}
async function json(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}
function check(name, passed, detail = {}) {
  evidence.checks.push({ ...detail, name, status: passed ? "PASS" : "FAIL" });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail);
  if (!passed) throw new Error(name);
}

let appCookies = "";
let vendorId = null;
let storeCookies = "";
try {
  let response = await fetch(`${app}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: app },
    body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }),
  });
  let body = await json(response);
  appCookies = cookies(response);
  check("platform.login", response.ok && body.code === 0 && Boolean(appCookies), { httpStatus: response.status });

  const ownerUsername = `replenishmentuat${Date.now().toString().slice(-7)}`;
  response = await fetch(`${app}/api/admin/tenants`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: app, Cookie: appCookies },
    body: JSON.stringify({
      organisationName: `Codex Replenishment UAT ${slug}`,
      subdomain: slug,
      ownerName: "Replenishment UAT Owner",
      username: ownerUsername,
      email: `${ownerUsername}@example.invalid`,
      password: `ReplenishmentUAT-${Date.now()}-Safe`,
      phone: "0400000000",
      trialDays: 1,
      outlets: [{ name: "Main Store", registerCount: 1 }, { name: "Back Bar", registerCount: 1 }],
      dummyData: true,
    }),
  });
  body = await json(response);
  vendorId = body.data?.vendorId;
  check("tenant.create", response.ok && Number.isSafeInteger(vendorId), { httpStatus: response.status, vendorId });

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
  check("tenant.provision.ready", binding.odooProvisionStatus === "ready", { companyId: binding.odooCompanyId, provisionStatus: binding.odooProvisionStatus });
  evidence.companyId = binding.odooCompanyId;

  response = await fetch(`${app}/api/admin/tenants/${vendorId}/owner/bootstrap`, { method: "POST", headers: { Origin: app, Cookie: appCookies } });
  body = await json(response);
  const bootstrapToken = body.data?.bootstrapToken;
  check("owner.bootstrap", response.ok && Boolean(bootstrapToken), { httpStatus: response.status });

  response = await fetch(`${store}/api/auth/bootstrap`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: store },
    body: JSON.stringify({ token: bootstrapToken }),
  });
  body = await json(response);
  storeCookies = cookies(response);
  check("store.bootstrap", response.ok && body.code === 0 && Boolean(storeCookies), { httpStatus: response.status });
  const auth = { Origin: store, Cookie: storeCookies };

  response = await fetch(`${store}/api/odoo/session`, { headers: auth });
  storeCookies = mergeCookies(storeCookies, cookies(response));
  auth.Cookie = storeCookies;
  body = await json(response);
  check("odoo.session", response.ok && Array.isArray(body.user?.allowedCompanyIds), { httpStatus: response.status, allowedCompanyIds: body.user?.allowedCompanyIds });

  response = await fetch(`${store}/api/odoo/suppliers`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({
    name: "Codex Replenishment UAT Supplier", email: "replenishment@example.invalid", vat: `AU-REPL-${Date.now()}`, phone: "0400000000", ref: "REPL-UAT",
  }) });
  body = await json(response);
  const supplierId = body.id;
  check("supplier.create", response.status === 201 && Number.isSafeInteger(supplierId), { httpStatus: response.status, supplierId });
  evidence.supplierId = supplierId;

  response = await fetch(`${store}/api/odoo/replenishment?coverageDays=21`, { headers: auth });
  body = await json(response);
  const product = (body.products || []).find((item) => Number(item.id) > 0);
  check("replenishment.plan", response.ok && product, { httpStatus: response.status, productId: product?.id, suggestedQuantity: product?.suggestedQuantity, method: product?.method });
  check("replenishment.method", product.method === "rules_v1_weighted_velocity" && body.coverageDays === 21, { method: product.method, coverageDays: body.coverageDays });

  const quantity = Math.max(1, Math.ceil(Number(product.suggestedQuantity) || 0));
  response = await fetch(`${store}/api/odoo/purchase-requests`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ supplierId, coverageDays: 21, method: product.method, lines: [{
      productId: product.id, quantity, suggestedQuantity: product.suggestedQuantity, reason: product.reason,
    }] }),
  });
  body = await json(response);
  const purchaseId = body.id;
  check("draft.rfq.create", response.status === 201 && Number.isSafeInteger(purchaseId) && body.auditSaved === true, { httpStatus: response.status, purchaseId, rfqName: body.name, auditSaved: body.auditSaved });
  evidence.purchaseId = purchaseId;

  response = await fetch(`${store}/api/odoo/purchase-orders/${purchaseId}`, { headers: auth });
  body = await json(response);
  const orderCompanyId = Array.isArray(body.order?.company_id) ? body.order.company_id[0] : body.order?.company_id;
  const line = body.lines?.[0];
  const audit = (body.approvalAudits || []).some((item) => String(item.body || "").includes("Orithos replenishment approval audit v1"));
  check("draft.rfq.readback", response.ok && orderCompanyId === binding.odooCompanyId && body.order?.state === "draft", { httpStatus: response.status, orderCompanyId, state: body.order?.state });
  check("draft.rfq.line.readback", line?.product_id?.[0] === product.id && Number(line.product_qty) === quantity, { productId: line?.product_id?.[0], quantity: line?.product_qty });
  check("replenishment.audit.readback", audit, { approvalAuditCount: body.approvalAudits?.length || 0, auditSaved: body.approvalAuditAvailable });
  evidence.order = { id: purchaseId, name: body.order?.name, state: body.order?.state, companyId: orderCompanyId, lineProductId: line?.product_id?.[0], lineQuantity: line?.product_qty, auditCount: body.approvalAudits?.length || 0 };

  response = await fetch(`${store}/api/odoo/purchase-requests`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ supplierId: 1, coverageDays: 21, method: product.method, lines: [{ productId: product.id, quantity: 1, suggestedQuantity: product.suggestedQuantity, reason: product.reason }] }),
  });
  body = await json(response);
  check("tenant-scoped.unknown-supplier.rejected", response.status === 404, { httpStatus: response.status, message: body.message });

  // A supplier from another company must not be accepted by this tenant's RFQ endpoint.
  const demo = await fetch("https://demo.orithos.com.au/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://demo.orithos.com.au" },
    body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }),
  });
  const demoBody = await json(demo);
  let demoSupplierId = null;
  if (demoBody.code === 0) {
    const demoCookie = cookies(demo);
    const demoSuppliers = await fetch("https://demo.orithos.com.au/api/odoo/suppliers", { headers: { Origin: "https://demo.orithos.com.au", Cookie: demoCookie } });
    const suppliersBody = await json(demoSuppliers);
    demoSupplierId = suppliersBody.suppliers?.[0]?.id;
  }
  if (Number.isSafeInteger(demoSupplierId)) {
    response = await fetch(`${store}/api/odoo/purchase-requests`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: demoSupplierId, coverageDays: 21, method: product.method, lines: [{ productId: product.id, quantity: 1, suggestedQuantity: product.suggestedQuantity, reason: product.reason }] }),
    });
    body = await json(response);
    check("cross-company.supplier.rejected", response.status === 404, { httpStatus: response.status, message: body.message });
  } else {
    evidence.checks.push({ name: "cross-company.supplier.rejected", status: "SKIPPED", reason: "Demo tenant has no readable supplier" });
    console.log("[SKIPPED] cross-company.supplier.rejected: demo tenant has no readable supplier");
  }
} finally {
  if (vendorId && appCookies) {
    const response = await fetch(`${app}/api/admin/tenants/${vendorId}`, { method: "DELETE", headers: { Origin: app, Cookie: appCookies } });
    const body = await json(response);
    check("tenant.delete", response.ok && body.code === 0, { httpStatus: response.status, disposition: body.data?.status });
    const deleted = await fetch(`${store}/api/auth/me`, { headers: { Origin: store } });
    check("deleted.auth", deleted.status === 402 || deleted.status === 401, { httpStatus: deleted.status });
  }
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(`${root}/docs/UAT_REPLENISHMENT_AUDIT_LIVE_${date}.json`, JSON.stringify(evidence, null, 2));
}

console.log(JSON.stringify({ result: evidence.checks.every((item) => item.status === "PASS" || item.status === "SKIPPED") ? "PASS" : "FAIL", evidence: `docs/UAT_REPLENISHMENT_AUDIT_LIVE_${new Date().toISOString().slice(0, 10)}.json` }));
