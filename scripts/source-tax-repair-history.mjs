/** Capture the full native sales scope with tax inputs. No business write RPC. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith("--") || !process.argv[i + 1]) throw Error("Expected --name value arguments");
  args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
const required = ["env", "company", "store", "timezone", "from", "to", "out"];
if (required.some(k => !args.get(k)) || [...args.keys()].some(k => !required.includes(k))) throw Error("Use --env PATH --company ID --store KEY --timezone IANA --from DAY --to DAY --out DIRECTORY");
for (const key of ["from", "to"]) {
  const day = args.get(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day) throw Error("Invalid business date");
}
if (args.get("from") >= args.get("to")) throw Error("Empty capture period");
const ruleVersion = "source-tax-repair-v2";
const scope = Object.fromEntries(["company", "store", "timezone", "from", "to"].map(k => [k, args.get(k)]));
const out = path.resolve(args.get("out")), indexPath = path.join(out, "tax-history-index.json");
await fs.mkdir(out, { recursive: true });
let index;
try { index = JSON.parse(await fs.readFile(indexPath, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
if (index && (JSON.stringify(index.scope) !== JSON.stringify(scope) || index.ruleVersion !== ruleVersion)) throw Error("Existing capture has a different scope or rule version");
index ??= { scope, ruleVersion, complete: false, executable: false, businessWrites: 0, crossWindowRevalidated: false, windows: [] };
async function save() {
  await fs.writeFile(indexPath + ".tmp", JSON.stringify(index, null, 2));
  await fs.rename(indexPath + ".tmp", indexPath);
}
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
for (let cursor = scope.from; cursor < scope.to;) {
  const date = new Date(cursor + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + 90);
  const next = date.toISOString().slice(0, 10), end = next < scope.to ? next : scope.to;
  const done = index.windows.find(w => w.from === cursor && w.to === end);
  if (done) {
    if (hash(await fs.readFile(done.snapshot)) !== done.sourceHash || hash(await fs.readFile(done.plan)) !== done.planHash) throw Error("Saved tax capture hash mismatch");
    cursor = end; continue;
  }
  console.log(JSON.stringify({ status: "capturing", from: cursor, to: end }));
  const childArgs = ["--experimental-strip-types", path.resolve("scripts/cost-reconciliation.mjs"), ...["env", "company", "store", "timezone"].flatMap(k => [`--${k}`, args.get(k)]), "--from", cursor, "--to", end, "--limit", "0", "--tax-only", "true", "--out", path.join(out, cursor)];
  const result = await new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    const child = spawn(process.execPath, childArgs, { windowsHide: true });
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", reject); child.on("exit", code => resolve({ code, stdout, stderr }));
  });
  if (result.code !== 0) {
    index.lastFailure = { from: cursor, to: end, at: new Date().toISOString(), diagnostic: result.stderr };
    await save(); throw Error("Window failed; inspect retained results before resuming");
  }
  const summary = JSON.parse(result.stdout), snapshot = summary.files.find(f => f.endsWith(".snapshot.json")), planPath = summary.files.find(f => f.endsWith(".source-tax-plan.json"));
  const planBytes = await fs.readFile(planPath), plan = JSON.parse(planBytes);
  if (plan.version !== ruleVersion || !plan.coverageComplete || plan.sourceHash !== summary.sourceHash || hash(await fs.readFile(snapshot)) !== summary.sourceHash) throw Error("Incomplete or inconsistent tax capture");
  index.windows.push({ from: cursor, to: end, snapshot, plan: planPath, sourceHash: summary.sourceHash, planHash: hash(planBytes), summary: plan.summary });
  delete index.lastFailure; await save();
  console.log(JSON.stringify({ status: "captured", from: cursor, ...plan.summary }));
  cursor = end;
}
index.summary = { orders: 0, supported: 0, review: 0, needsChange: 0, supportedLines: 0 };
index.blockers = {};
index.coverageTotals = { nativeLines: 0, sourceCompletedOrders: 0, sourceMissingNativeOrders: 0, importedMissingSourceOrders: 0 };
index.supportedLineInputs = { paidUnitNormalizations: 0, nonzeroSourceTaxWithoutLineTax: 0 };
for (const window of index.windows) {
  const plan = JSON.parse(await fs.readFile(window.plan));
  const snapshot = JSON.parse(await fs.readFile(window.snapshot));
  index.coverageTotals.nativeLines += snapshot.lines.length;
  for (const key of ["sourceCompletedOrders", "sourceMissingNativeOrders", "importedMissingSourceOrders"]) index.coverageTotals[key] += snapshot.coverage[key];
  for (const key of Object.keys(index.summary)) index.summary[key] += plan.summary[key];
  for (const order of plan.orders) {
    for (const reason of order.blockers) index.blockers[reason] = (index.blockers[reason] ?? 0) + 1;
    for (const line of order.lines) {
      if (line.pricingBasis === "source_paid_unit_normalization") index.supportedLineInputs.paidUnitNormalizations++;
      if (line.sourcePricing.tax !== 0 && !line.expected.taxIds.length) index.supportedLineInputs.nonzeroSourceTaxWithoutLineTax++;
    }
  }
}
index.complete = true; index.completedAt = new Date().toISOString();
index.executionBlockers = ["LIVE_SOURCE_AND_TARGET_REVALIDATION_REQUIRED", "CROSS_WINDOW_REVALIDATION_REQUIRED", "ODOO_TAX_AND_PRICE_PRECISION_RECOMPUTATION_REQUIRED", "HISTORICAL_TAX_DEFINITION_REQUIRED", "POSTED_ACCOUNTING_IMPACT_NOT_CHECKED"];
await save();
console.log(JSON.stringify({ status: "captured", index: indexPath, ...index.summary, executable: false, businessWrites: 0 }));
