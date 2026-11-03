/** Sequential, resumable full-product audits. The index never turns partial evidence into a margin. */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { COST_RULE_VERSION } from "../pos-ui/src/lib/cost-reconciliation.ts";
import { shopfrontSourceMargin } from "../pos-ui/src/lib/shopfront-source-margin.ts";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith("--") || !process.argv[i + 1]) throw Error("Arguments require --key VALUE");
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
if ([...args.keys()].some(k => !["env", "company", "store", "out", "from", "to", "timezone", "source-only"].includes(k))) throw Error("Unknown argument");
if (args.has("source-only") && args.get("source-only") !== "true") throw Error("Use --source-only true");
for (const key of ["env", "company", "store", "out", "from", "to", "timezone"]) if (!args.get(key)) throw Error(`Missing --${key}`);
const from = args.get("from"), to = args.get("to"), out = path.resolve(args.get("out"));
for (const day of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day) throw Error("Invalid business date");
if (from >= to) throw Error("Empty history range");
await fs.mkdir(out, { recursive: true });
const indexPath = path.join(out, "history-index.json");
const identity = { companyId: Number(args.get("company")), store: args.get("store"), timezone: args.get("timezone"), from, to, ruleVersion: COST_RULE_VERSION, sourceOnly: args.get("source-only") === "true" };
let index;
try { index = JSON.parse(await fs.readFile(indexPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (index && JSON.stringify(index.scope) !== JSON.stringify(identity)) throw Error("Output belongs to a different scope or rule version");
index ??= { scope: identity, complete: false, businessWrites: 0, grossMarginPercent: null, windows: [] };
async function save() { await fs.writeFile(indexPath + ".tmp", JSON.stringify(index, null, 2)); await fs.rename(indexPath + ".tmp", indexPath); }
for (let cursor = from; cursor < to;) {
  const next = new Date(cursor + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + 90);
  const end = next.toISOString().slice(0, 10) < to ? next.toISOString().slice(0, 10) : to;
  const done = index.windows.find(window => window.from === cursor && window.to === end);
  if (done) {
    const snapshot = await fs.readFile(done.snapshot);
    if (createHash("sha256").update(snapshot).digest("hex") !== done.sourceHash) throw Error("Saved snapshot hash mismatch");
    const captured = JSON.parse(snapshot);
    done.sourceMargin = shopfrontSourceMargin(captured.sourceSales ?? [], captured.from, captured.to, captured.coverage?.sourceRowsComplete === true);
    cursor = end; continue;
  }
  console.log(JSON.stringify({ status: "capturing", from: cursor, to: end, companyId: identity.companyId }));
  const childArgs = ["--experimental-strip-types", path.resolve("scripts/cost-reconciliation.mjs"), ...["env", "company", "store", "timezone"].flatMap(k => [`--${k}`, args.get(k)]), "--from", cursor, "--to", end, "--limit", "0", "--out", path.join(out, cursor)];
  if (identity.sourceOnly) childArgs.push("--source-only", "true");
  const result = await new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const child = spawn(process.execPath, childArgs, { windowsHide: true });
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", reject); child.on("exit", code => resolve({ code, stdout, stderr }));
  });
  if (result.code !== 0) { index.lastFailure = { from: cursor, to: end, at: new Date().toISOString(), diagnostic: result.stderr }; await save(); throw Error("Window capture failed; completed windows retained. See local history index."); }
  const summary = JSON.parse(result.stdout), auditPath = summary.files.find(file => file.endsWith(".json") && !file.endsWith(".snapshot.json") && !file.endsWith(".repair-manifest.json"));
  const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
  const snapshot = summary.files.find(file => file.endsWith(".snapshot.json"));
  index.windows.push({ from: cursor, to: end, batchId: audit.batchId, sourceHash: audit.sourceHash, snapshot, audit: auditPath, summary: audit.summary, sourceMargin: audit.sourceMargin ?? null });
  delete index.lastFailure; await save();
  console.log(JSON.stringify({ status: "captured", from: cursor, to: end, lines: audit.summary.lines, reviewProducts: audit.summary.review }));
  cursor = end;
}
index.complete = true; index.completedAt = new Date().toISOString();
const sourceReports = index.windows.map(w => w.sourceMargin);
const sum = field => Number(sourceReports.reduce((n, r) => n + BigInt(Number(r[field]).toFixed(6).replace(".", "")), BigInt(0))) / 1e6;
index.sourceMargin = { basis: "shopfront_original_sale_cost", accountingVerified: false, crossWindowRevalidated: false,
  complete: sourceReports.every(r => r?.complete), completedOrders: sum("completedOrders"), lines: sum("lines"),
  excludedOrders: sum("excludedOrders"), refundLines: sum("refundLines"), costEvidencePendingLines: sum("costEvidencePendingLines"),
  normalizedMismatchSaleIds: sourceReports.flatMap(r => r.normalizedMismatchSaleIds ?? []) };
if (index.sourceMargin.complete) {
  for (const field of ["grossSales", "tax", "netSales", "salesCost", "grossProfit"]) index.sourceMargin[field] = sum(field);
  index.sourceMargin.grossMarginPercent = index.sourceMargin.netSales > 0 ? Number((index.sourceMargin.grossProfit / index.sourceMargin.netSales * 100).toFixed(6)) : null;
}
// Each window has its own capture timestamp. This is a complete scan, not an atomic ledger snapshot.
index.publicationBlockers = ["CROSS_WINDOW_SNAPSHOT_REQUIRES_FINAL_REVALIDATION", ...new Set(index.windows.flatMap(w => w.summary.publicationBlockers ?? ["LEGACY_AUDIT"]))];
await save();
console.log(JSON.stringify({ index: indexPath, complete: true, windows: index.windows.length, lines: index.windows.reduce((n, w) => n + w.summary.lines, 0), grossMarginPercent: null, businessWrites: 0 }));
