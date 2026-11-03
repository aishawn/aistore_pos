/** Read-only Odoo audit. No business write RPC is reachable from this script. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { loadCostSnapshot } from "../pos-ui/src/lib/cost-reconciliation-source.ts";
import { reconcileCosts, costAuditCsv } from "../pos-ui/src/lib/cost-reconciliation.ts";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith("--") || !process.argv[i + 1]) throw Error("Use --env PATH --company ID --store KEY --out DIRECTORY [--from YYYY-MM-DD --to YYYY-MM-DD --timezone IANA --limit 20|0]");
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
if ([...args.keys()].some(k => !["env", "company", "store", "out", "from", "to", "timezone", "limit", "snapshot"].includes(k))) throw Error("Unsupported argument");
const out = path.resolve(args.get("out") || ".local/cost-reconciliation");
await fs.mkdir(out, { recursive: true });
let snapshot;
if (args.has("snapshot")) snapshot = JSON.parse(await fs.readFile(args.get("snapshot"), "utf8"));
else {
  const env = { ...process.env };
  if (args.has("env")) for (const line of (await fs.readFile(args.get("env"), "utf8")).split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  const database = env.ODOO_DATABASE;
  if (database !== "aipos_uat") throw Error("Read audit must explicitly select ODOO_DATABASE=aipos_uat");
  const base = (env.ODOO_BASE_URL || "https://odoo.orithos.com.au").replace(/\/+$/, "");
  if (new URL(base).protocol !== "https:") throw Error("HTTPS required");
  let cookie = "";
  async function call(endpoint, params) {
    const response = await fetch(base + endpoint, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: 1 }), signal: AbortSignal.timeout(60_000) });
    for (const entry of response.headers.getSetCookie()) if (entry.startsWith("session_id=")) cookie = entry.split(";")[0];
    if (!response.ok) throw Error(`Odoo HTTP ${response.status}`);
    const body = await response.json(); if (body.error) throw Error(`Odoo read rejected (${body.error.data?.name || "RPC_ERROR"})`);
    return body.result;
  }
  const login = await call("/web/session/authenticate", { db: database, login: env.ODOO_USER || env.ODOO_SERVICE_USERNAME, password: env.ODOO_PASS || env.ODOO_SERVICE_PASSWORD });
  if (!login?.uid) throw Error("Odoo authentication failed");
  const companyId = Number(args.get("company")), store = args.get("store");
  if (!Number.isSafeInteger(companyId) || companyId < 1 || !store) throw Error("Explicit --company and --store required");
  const rpc = (model, method, rpcArgs, kwargs = {}) => {
    if (!["read", "search_read", "search_count", "fields_get"].includes(method)) throw Error("Business writes are forbidden");
    const { active_test: activeTest, ...methodKwargs } = kwargs;
    return call("/web/dataset/call_kw", { model, method, args: rpcArgs, kwargs: { ...methodKwargs, context: { allowed_company_ids: [companyId], force_company: companyId, active_test: activeTest !== false } } });
  };
  snapshot = await loadCostSnapshot(rpc, { companyId, store, fromDay: args.get("from"), toDay: args.get("to"), timezone: args.get("timezone"), limit: args.get("limit") === "0" ? 0 : 20 });
}
const bytes = JSON.stringify(snapshot), sourceHash = createHash("sha256").update(bytes).digest("hex");
const audit = reconcileCosts(snapshot, randomUUID(), sourceHash), prefix = path.join(out, audit.batchId);
await fs.writeFile(`${prefix}.snapshot.json`, bytes, { flag: "wx" });
await fs.writeFile(`${prefix}.json`, JSON.stringify(audit, null, 2), { flag: "wx" });
await fs.writeFile(`${prefix}.csv`, costAuditCsv(audit), { flag: "wx" });
const repair = { batchId: audit.batchId, sourceHash, ruleVersion: audit.ruleVersion, dryRun: true, businessWrites: 0,
  proposed: audit.products.flatMap(p => p.lines.filter(l => l.status === "correctable").map(l => ({ model: "pos.order.line", id: l.saleLineId, originalCost: l.originalTotalCost, proposedCost: l.proposedTotalCost }))),
  supportedButBlocked: audit.products.flatMap(p => p.lines.filter(l => l.status === "review" && l.proposedTotalCost !== null).map(l => ({ id: l.saleLineId, originalCost: l.originalTotalCost, supportedSourceCost: l.proposedTotalCost, supportedNet: l.proposedNet, sourceSaleId: l.sourceSaleId, sourceLineId: l.sourceLineId, blockers: l.issues }))),
  pending: audit.products.map(p => ({ productId: p.id, name: p.name, issues: p.issues })) };
await fs.writeFile(`${prefix}.repair-manifest.json`, JSON.stringify(repair, null, 2), { flag: "wx" });
console.log(JSON.stringify({ batchId: audit.batchId, sourceHash, store: audit.store, companyId: audit.companyId, timezone: audit.timezone, from: audit.from, to: audit.to, ...audit.summary, files: [".json", ".csv", ".snapshot.json", ".repair-manifest.json"].map(s => prefix + s), businessWrites: 0 }, null, 2));
