import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const APP = "https://app.orithos.com.au";
const evidence = { generatedAt: new Date().toISOString(), scope: "temporary-tenant purchase confirmation and receipt recovery", checks: [] };
const cookieHeader = (response) => (response.headers.getSetCookie?.() ?? []).map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
const json = async (response) => { const text = await response.text(); try { return JSON.parse(text); } catch { return { raw: text.slice(0, 400) }; } };
const check = (name, passed, detail = {}) => { evidence.checks.push({ name, status: passed ? "PASS" : "FAIL", ...detail }); console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail); return passed; };

let platformCookie = "";
let tenant = null;
let failed = false;
async function storeJson(pathname, options = {}) {
  const response = await fetch(`${tenant.store}${pathname}`, { ...options, headers: { Origin: tenant.store, Cookie: tenant.cookie, ...(options.headers || {}) } });
  return { response, body: await json(response) };
}

try {
  let response = await fetch(`${APP}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP }, body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }) });
  platformCookie = cookieHeader(response);
  let body = await json(response);
  failed ||= !check("platform.login", response.ok && body.code === 0 && Boolean(platformCookie), { httpStatus: response.status });
  if (!platformCookie) throw new Error("platform login failed");

  const suffix = Date.now().toString().slice(-10);
  const slug = `codex-receive-${suffix}`;
  response = await fetch(`${APP}/api/admin/tenants`, { method: "POST", headers: { "Content-Type": "application/json", Origin: APP, Cookie: platformCookie }, body: JSON.stringify({ organisationName: `Codex Receive UAT ${suffix}`, subdomain: slug, ownerName: "Receive UAT", username: `receive${suffix.slice(-7)}`, email: `${slug}@example.invalid`, password: `Receive-${suffix}-Safe`, phone: "0400000000", trialDays: 1, outlets: [{ name: "Main", registerCount: 1 }], dummyData: true }) });
  body = await json(response);
  tenant = { vendorId: body.data?.vendorId, store: `https://${slug}.orithos.com.au`, slug, cookie: "", companyId: null };
  failed ||= !check("tenant.create", response.status === 200 && Number.isSafeInteger(tenant.vendorId), { httpStatus: response.status, vendorId: tenant.vendorId });
  if (!tenant.vendorId) throw new Error("tenant create failed");

  let binding = {};
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const detailResponse = await fetch(`${APP}/api/admin/tenants/${tenant.vendorId}`, { headers: { Origin: APP, Cookie: platformCookie } });
    const detail = await json(detailResponse);
    binding = detail.data?.odooBinding || detail.data || {};
    if (binding.odooProvisionStatus === "ready") break;
  }
  tenant.companyId = binding.odooCompanyId ?? null;
  failed ||= !check("tenant.provision.ready", binding.odooProvisionStatus === "ready", { provisionStatus: binding.odooProvisionStatus, companyId: tenant.companyId });
  if (binding.odooProvisionStatus !== "ready") throw new Error("provisioning failed");

  const bootstrapResponse = await fetch(`${APP}/api/admin/tenants/${tenant.vendorId}/owner/bootstrap`, { method: "POST", headers: { Origin: APP, Cookie: platformCookie } });
  const bootstrap = await json(bootstrapResponse);
  const storeResponse = await fetch(`${tenant.store}/api/auth/bootstrap`, { method: "POST", headers: { "Content-Type": "application/json", Origin: tenant.store }, body: JSON.stringify({ token: bootstrap.data?.bootstrapToken }) });
  tenant.cookie = cookieHeader(storeResponse);
  body = await json(storeResponse);
  failed ||= !check("tenant.bootstrap", bootstrapResponse.ok && storeResponse.ok && body.code === 0 && Boolean(tenant.cookie), { bootstrapStatus: bootstrapResponse.status, storeStatus: storeResponse.status });
  const sessionResponse = await fetch(`${tenant.store}/api/odoo/session`, { headers: { Origin: tenant.store, Cookie: tenant.cookie } });
  tenant.cookie = [tenant.cookie, cookieHeader(sessionResponse)].filter(Boolean).join("; ");
  failed ||= !check("tenant.odoo.session", sessionResponse.ok, { httpStatus: sessionResponse.status });

  const supplierResult = await storeJson("/api/odoo/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Receive Supplier ${suffix}`, email: `receive-${suffix}@example.invalid`, vat: `AU-RECEIVE-${suffix}`, ref: "CODEX-RECEIVE-UAT" }) });
  const supplierId = supplierResult.body.id;
  failed ||= !check("supplier.create", supplierResult.response.status === 201 && Number.isSafeInteger(supplierId), { httpStatus: supplierResult.response.status, supplierId });

  const planResult = await storeJson("/api/odoo/replenishment?coverageDays=21");
  const product = (planResult.body.products || []).find((item) => Number.isSafeInteger(item.id) && item.method === "rules_v1_weighted_velocity");
  failed ||= !check("replenishment.read", planResult.response.ok && product, { httpStatus: planResult.response.status, productId: product?.id ?? null, method: product?.method ?? null });
  if (!product) throw new Error("no replenishment product");

  const rfqResult = await storeJson("/api/odoo/purchase-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId, coverageDays: 21, method: product.method, lines: [{ productId: product.id, quantity: 3, suggestedQuantity: product.suggestedQuantity, reason: product.reason }] }) });
  const purchaseId = rfqResult.body.id;
  failed ||= !check("draft.rfq.create", rfqResult.response.status === 201 && Number.isSafeInteger(purchaseId) && rfqResult.body.auditSaved === true, { httpStatus: rfqResult.response.status, purchaseId, auditSaved: rfqResult.body.auditSaved });
  if (!purchaseId) throw new Error("RFQ create failed");

  const confirmResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
  failed ||= !check("purchase.confirm", confirmResult.response.ok && confirmResult.body.ok === true, { httpStatus: confirmResult.response.status, state: confirmResult.body.state ?? null });

  let orderResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}`);
  const firstReceipt = orderResult.body.receivable;
  const firstMove = firstReceipt?.moves?.[0];
  failed ||= !check("purchase.receipt.readback", orderResult.response.ok && firstReceipt?.pickingId && firstMove?.id && Number(firstMove.product_uom_qty) >= 3, { httpStatus: orderResult.response.status, pickingId: firstReceipt?.pickingId ?? null, moveId: firstMove?.id ?? null, orderedQty: firstMove?.product_uom_qty ?? null });
  if (!firstReceipt || !firstMove) throw new Error("open receipt not available");

  const overResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}/receive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, pickingId: firstReceipt.pickingId, lines: [{ moveId: firstMove.id, qtyDone: Number(firstMove.product_uom_qty) + 1 }] }) });
  failed ||= !check("over-receive.blocked", overResult.response.status === 400, { httpStatus: overResult.response.status, message: overResult.body.message });

  const partialResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}/receive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, pickingId: firstReceipt.pickingId, lines: [{ moveId: firstMove.id, qtyDone: 1 }] }) });
  failed ||= !check("partial.receive", partialResult.response.ok && partialResult.body.resultState === "confirmed", { httpStatus: partialResult.response.status, resultState: partialResult.body.resultState, pickingState: partialResult.body.pickingState });

  const duplicateResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}/receive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, pickingId: firstReceipt.pickingId, lines: [{ moveId: firstMove.id, qtyDone: 1 }] }) });
  failed ||= !check("duplicate.receive.idempotent", duplicateResult.response.ok && duplicateResult.body.resultState === "already_completed", { httpStatus: duplicateResult.response.status, resultState: duplicateResult.body.resultState });

  orderResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}`);
  const backorder = orderResult.body.receivable;
  const backorderMove = backorder?.moves?.[0];
  failed ||= !check("backorder.readback", orderResult.response.ok && backorderMove?.id && Number(backorderMove.remaining) >= 2, { httpStatus: orderResult.response.status, pickingId: backorder?.pickingId ?? null, moveId: backorderMove?.id ?? null, remaining: backorderMove?.remaining ?? null });
  if (backorder && backorderMove) {
    const finalResult = await storeJson(`/api/odoo/purchase-orders/${purchaseId}/receive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, pickingId: backorder.pickingId, lines: [{ moveId: backorderMove.id, qtyDone: Number(backorderMove.remaining) }] }) });
    failed ||= !check("remaining.receive", finalResult.response.ok && finalResult.body.resultState === "confirmed", { httpStatus: finalResult.response.status, resultState: finalResult.body.resultState, pickingState: finalResult.body.pickingState });
  }
  const finalOrder = await storeJson(`/api/odoo/purchase-orders/${purchaseId}`);
  failed ||= !check("final.purchase.readback", finalOrder.response.ok && !finalOrder.body.receivable, { httpStatus: finalOrder.response.status, receivable: finalOrder.body.receivable ? { pickingId: finalOrder.body.receivable.pickingId } : null });
} catch (error) {
  failed = true;
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (tenant?.vendorId && platformCookie) {
    const response = await fetch(`${APP}/api/admin/tenants/${tenant.vendorId}`, { method: "DELETE", headers: { Origin: APP, Cookie: platformCookie } });
    const body = await json(response);
    check("tenant.delete", response.ok && body.code === 0, { httpStatus: response.status, tenantStatus: body.data?.status ?? null });
    const deletedAuth = await fetch(`${tenant.store}/api/auth/me`, { headers: { Origin: tenant.store } });
    check("deleted.auth", [401, 402].includes(deletedAuth.status), { httpStatus: deletedAuth.status });
  }
  evidence.status = failed || evidence.checks.some((item) => item.status === "FAIL") ? "FAIL" : "PASS";
  const outputPath = path.join(root, "docs", `UAT_PURCHASE_RECEIVE_LIVE_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: evidence.status }));
  if (evidence.status !== "PASS") process.exitCode = 1;
}
