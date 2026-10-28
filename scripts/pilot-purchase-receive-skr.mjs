import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL ?? "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? "shawn";
const password = process.env.PILOT_PASSWORD;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? `docs/UAT_PURCHASE_RECEIVE_SKR_${new Date().toISOString().slice(0, 10)}.json`);
const checks = [];
const check = (name, passed, detail = {}) => {
  checks.push({ name, status: passed ? "PASS" : "FAIL", detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail);
  return passed;
};

let client;
async function call(method, pathname, data) {
  const response = await client.fetch(`${base}${pathname}`, {
    method,
    data,
    headers: { Origin: base },
    timeout: 60_000,
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  client = await request.newContext();
  if (!password) throw new Error("PILOT_PASSWORD is required and is never written to evidence");

  const login = await call("POST", "/api/auth/login", { username, password });
  check("login", login.response.ok() && login.body.code === 0, { httpStatus: login.response.status(), username });
  if (!login.response.ok() || login.body.code !== 0) throw new Error("LOGIN_FAILED");

  const session = await call("GET", "/api/odoo/session");
  check("odoo.session", session.response.ok() && Boolean(session.body.user), { httpStatus: session.response.status(), user: session.body.user?.username });
  const suppliers = await call("GET", "/api/odoo/purchase-requests");
  let supplier = (suppliers.body.suppliers ?? []).find((item) => Number.isSafeInteger(item.id));
  if (!supplier && suppliers.response.ok()) {
    const suffix = Date.now().toString().slice(-10);
    const created = await call("POST", "/api/odoo/suppliers", {
      name: `Codex UAT Receive Supplier ${suffix}`,
      email: `codex-receive-${suffix}@example.invalid`,
      vat: `AU-CODEX-${suffix}`,
      ref: "CODEX-UAT-RECEIVE",
    });
    supplier = created.body.id ? { id: created.body.id, name: created.body.name } : null;
    check("supplier.create", created.response.status() === 201 && Boolean(supplier), { httpStatus: created.response.status(), supplierId: supplier?.id ?? null });
  }
  check("supplier.read", suppliers.response.ok() && Boolean(supplier), { httpStatus: suppliers.response.status(), supplierId: supplier?.id ?? null });
  if (!supplier) throw new Error("NO_SUPPLIER");

  const plan = await call("GET", "/api/odoo/replenishment?coverageDays=21");
  const product = (plan.body.products ?? []).find((item) => Number.isSafeInteger(item.id) && item.method === "rules_v1_weighted_velocity" && item.purchaseOk !== false && item.purchase_ok !== false);
  check("replenishment.read", plan.response.ok() && Boolean(product), { httpStatus: plan.response.status(), productId: product?.id ?? null });
  if (!product) throw new Error("NO_PURCHASABLE_PRODUCT");

  const quantity = 3;
  const rfq = await call("POST", "/api/odoo/purchase-requests", {
    supplierId: supplier.id,
    coverageDays: 21,
    method: product.method,
    lines: [{ productId: product.id, quantity, suggestedQuantity: Number(product.suggestedQuantity ?? quantity), reason: String(product.reason ?? "UAT receive lifecycle") }],
  });
  const purchaseId = rfq.body.id;
  check("rfq.create", rfq.response.status() === 201 && Number.isSafeInteger(purchaseId) && rfq.body.auditSaved === true, { httpStatus: rfq.response.status(), purchaseId, auditSaved: rfq.body.auditSaved });
  if (!purchaseId) throw new Error("RFQ_CREATE_FAILED");

  const confirmed = await call("POST", `/api/odoo/purchase-orders/${purchaseId}`, { confirm: true });
  check("purchase.confirm", confirmed.response.ok() && confirmed.body.ok === true, { httpStatus: confirmed.response.status(), state: confirmed.body.state ?? null });

  let detail = await call("GET", `/api/odoo/purchase-orders/${purchaseId}`);
  const receipt = detail.body.receivable;
  const move = receipt?.moves?.find((item) => Number.isSafeInteger(item.id));
  check("receipt.readback", detail.response.ok() && Number.isSafeInteger(receipt?.pickingId) && Boolean(move), { httpStatus: detail.response.status(), pickingId: receipt?.pickingId ?? null, moveId: move?.id ?? null, ordered: move?.product_uom_qty ?? null });
  if (!receipt || !move) throw new Error("RECEIPT_NOT_FOUND");

  const over = await call("POST", `/api/odoo/purchase-orders/${purchaseId}/receive`, { confirm: true, pickingId: receipt.pickingId, lines: [{ moveId: move.id, qtyDone: Number(move.product_uom_qty) + 1 }] });
  check("over-receive.blocked", over.response.status() === 400, { httpStatus: over.response.status(), message: over.body.message ?? null });

  const partial = await call("POST", `/api/odoo/purchase-orders/${purchaseId}/receive`, { confirm: true, pickingId: receipt.pickingId, lines: [{ moveId: move.id, qtyDone: 1 }] });
  check("partial.receive", partial.response.ok() && partial.body.resultState === "confirmed", { httpStatus: partial.response.status(), resultState: partial.body.resultState, pickingState: partial.body.pickingState });

  const duplicate = await call("POST", `/api/odoo/purchase-orders/${purchaseId}/receive`, { confirm: true, pickingId: receipt.pickingId, lines: [{ moveId: move.id, qtyDone: 1 }] });
  check("duplicate.receive.idempotent", duplicate.response.ok() && duplicate.body.resultState === "already_completed", { httpStatus: duplicate.response.status(), resultState: duplicate.body.resultState });

  detail = await call("GET", `/api/odoo/purchase-orders/${purchaseId}`);
  const backorder = detail.body.receivable;
  const backorderMove = backorder?.moves?.find((item) => Number.isSafeInteger(item.id));
  check("backorder.readback", detail.response.ok() && Number(backorderMove?.remaining) >= 2, { httpStatus: detail.response.status(), pickingId: backorder?.pickingId ?? null, remaining: backorderMove?.remaining ?? null });
  if (!backorder || !backorderMove) throw new Error("BACKORDER_NOT_FOUND");

  const remaining = await call("POST", `/api/odoo/purchase-orders/${purchaseId}/receive`, { confirm: true, pickingId: backorder.pickingId, lines: [{ moveId: backorderMove.id, qtyDone: Number(backorderMove.remaining) }] });
  check("remaining.receive", remaining.response.ok() && remaining.body.resultState === "confirmed", { httpStatus: remaining.response.status(), resultState: remaining.body.resultState, pickingState: remaining.body.pickingState });

  const final = await call("GET", `/api/odoo/purchase-orders/${purchaseId}`);
  check("final.purchase.readback", final.response.ok() && !final.body.receivable, { httpStatus: final.response.status(), purchaseId, receivable: final.body.receivable ? { pickingId: final.body.receivable.pickingId } : null });
} catch (error) {
  check("run", false, { message: error instanceof Error ? error.message : String(error) });
} finally {
  await client?.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await client?.dispose();
}

const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  username,
  databaseMode: "shared-uat",
  odooDatabase: "aipos_uat",
  scope: "purchase RFQ -> confirmation -> over-receive guard -> partial receipt -> duplicate retry -> backorder completion",
  status: checks.every((item) => item.status === "PASS"),
  checks,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((item) => item.status === "PASS").length }));
if (!output.status) process.exitCode = 1;
