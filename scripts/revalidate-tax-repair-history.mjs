/** Read-only count/version revalidation; never authorizes financial execution. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { shiftDay } from "../pos-ui/src/lib/replenishment-safety.ts";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]?.replace(/^--/, ""), process.argv[i + 1]);
if (!args.get("env") || !args.get("index") || [...args.keys()].some(k => !["env", "index"].includes(k))) throw Error("Use --env PATH --index PATH");
const env = { ...process.env };
for (const line of (await fs.readFile(args.get("env"), "utf8")).split(/\r?\n/)) {
  const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
}
if (env.ODOO_DATABASE !== "aipos_uat") throw Error("Explicit aipos_uat required");
const base = env.ODOO_BASE_URL || "https://odoo.orithos.com.au";
if (new URL(base).protocol !== "https:") throw Error("HTTPS required");
const indexBytes = await fs.readFile(args.get("index")), index = JSON.parse(indexBytes);
const companyId = Number(index.scope?.company), store = index.scope?.store;
if (!index.complete || index.ruleVersion !== "source-tax-repair-v2" || !Number.isSafeInteger(companyId) || companyId <= 0 || !/^[a-z0-9-]+$/.test(store)) throw Error("Complete scoped v2 capture required");
let cookie = "";
async function call(endpoint, params) {
  const response = await fetch(new URL(endpoint, base), { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: 1 }), signal: AbortSignal.timeout(60_000) });
  for (const entry of response.headers.getSetCookie()) if (entry.startsWith("session_id=")) cookie = entry.split(";")[0];
  if (!response.ok) throw Error(`Odoo HTTP ${response.status}`);
  const body = await response.json(); if (body.error) throw Error("Odoo read rejected");
  return body.result;
}
const login = await call("/web/session/authenticate", { db: env.ODOO_DATABASE, login: env.ODOO_USER || env.ODOO_SERVICE_USERNAME, password: env.ODOO_PASS || env.ODOO_SERVICE_PASSWORD });
if (!login?.uid) throw Error("Odoo authentication failed");
const allowed = ["pos.order", "pos.order.line", "product.product", "shopfront.sync.sale"];
const count = (model, domain) => {
  if (!allowed.includes(model)) throw Error("Unsupported read model");
  return call("/web/dataset/call_kw", { model, method: "search_count", args: [domain], kwargs: { context: { allowed_company_ids: [companyId], active_test: false } } });
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const result = { startedAt: new Date().toISOString(), database: env.ODOO_DATABASE, companyId, indexSha256: hash(indexBytes), checks: [], businessWrites: 0, executable: false, atomicSnapshot: false };
let earliest = "9999", first, last;
const productIds = new Set();
for (const window of index.windows) {
  const bytes = await fs.readFile(window.snapshot);
  if (hash(bytes) !== window.sourceHash || hash(await fs.readFile(window.plan)) !== window.planHash) throw Error("Saved evidence hash mismatch");
  const s = JSON.parse(bytes), cutoff = s.capturedAt.slice(0, 19).replace("T", " ");
  if (s.companyId !== companyId || s.store !== store || s.purpose !== "source_tax_only") throw Error("Snapshot scope mismatch");
  earliest = cutoff < earliest ? cutoff : earliest; first ??= s.from; last = s.to;
  for (const p of s.products) productIds.add(p.id);
  const orderDomain = [["company_id", "=", companyId], ["state", "in", ["paid", "done", "invoiced"]], ["date_order", ">=", s.from], ["date_order", "<", s.to]];
  const lineDomain = [["order_id.company_id", "=", companyId], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.date_order", ">=", s.from], ["order_id.date_order", "<", s.to]];
  const sources = [["store_key", "=", store], ["created_at", ">=", shiftDay(window.from, -1)], ["created_at", "<", shiftDay(window.to, 1)]];
  const products = [["id", "in", s.products.map(p => p.id)], ["company_id", "in", [false, companyId]]];
  for (const [model, domain, expected] of [["pos.order", orderDomain, s.orders.length], ["pos.order.line", lineDomain, s.lines.length], ["shopfront.sync.sale", sources, s.sourceSales.length], ["product.product", products, s.products.length]]) {
    const [actual, changed] = await Promise.all([count(model, domain), count(model, [...domain, ["write_date", ">=", cutoff]])]);
    result.checks.push({ from: window.from, model, expected, actual, changed, pass: actual === expected && changed === 0 });
  }
  console.log(JSON.stringify({ checked: window.from, pass: result.checks.slice(-4).every(c => c.pass) }));
}
const globalDomains = [
  ["pos.order", [["company_id", "=", companyId], ["state", "in", ["paid", "done", "invoiced"]], ["date_order", ">=", first], ["date_order", "<", last]]],
  ["pos.order.line", [["order_id.company_id", "=", companyId], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.date_order", ">=", first], ["order_id.date_order", "<", last]]],
  ["product.product", [["id", "in", [...productIds]], ["company_id", "in", [false, companyId]]]],
  ["shopfront.sync.sale", [["store_key", "=", store], ["created_at", ">=", shiftDay(index.scope.from, -1)], ["created_at", "<", shiftDay(index.scope.to, 1)]]],
];
result.crossWindowChecks = [];
for (const [model, domain] of globalDomains) {
  const changed = await count(model, [...domain, ["write_date", ">=", earliest]]);
  result.crossWindowChecks.push({ model, changedSinceFirstCapture: changed, pass: changed === 0 });
}
result.passed = result.checks.every(c => c.pass) && result.crossWindowChecks.every(c => c.pass);
result.finishedAt = new Date().toISOString();
result.limitations = ["Version/count checks through this check time; no lock or atomic snapshot.", "Padded source timestamp domains conservatively include adjacent dates.", "Passing version checks does not verify tax definitions, precision, accounting impact or costs."];
const file = args.get("index") + ".revalidation-" + result.finishedAt.replace(/[:.]/g, "-") + ".json";
await fs.writeFile(file, JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ file, passed: result.passed, checks: result.checks.length, businessWrites: 0, executable: false }));
if (!result.passed) process.exitCode = 1;
