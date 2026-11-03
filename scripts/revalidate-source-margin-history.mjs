/** Recheck captured source counts and versions. No business write methods. */
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
const index = JSON.parse(await fs.readFile(args.get("index"), "utf8"));
if (!index.complete || !index.sourceMargin?.complete) throw Error("Complete source scan required");
const count = domain => call("/web/dataset/call_kw", { model: "shopfront.sync.sale", method: "search_count", args: [domain], kwargs: { context: { allowed_company_ids: [index.scope.companyId], active_test: false } } });
let earliest = "9999";
for (const window of index.windows) {
  const bytes = await fs.readFile(window.snapshot);
  if (createHash("sha256").update(bytes).digest("hex") !== window.sourceHash) throw Error("Snapshot hash mismatch");
  const snapshot = JSON.parse(bytes), cutoff = snapshot.capturedAt.slice(0, 19).replace("T", " ");
  earliest = cutoff < earliest ? cutoff : earliest;
  const domain = [["store_key", "=", index.scope.store], ["created_at", ">=", shiftDay(window.from, -1)], ["created_at", "<", shiftDay(window.to, 1)]];
  if (await count(domain) !== snapshot.sourceSales.length || await count([...domain, ["write_date", ">=", cutoff]]) !== 0) throw Error(`Source changed since capture: ${window.from}; recapture this window`);
}
const domain = [["store_key", "=", index.scope.store], ["created_at", ">=", shiftDay(index.scope.from, -1)], ["created_at", "<", shiftDay(index.scope.to, 1)], ["write_date", ">=", earliest]];
if (await count(domain) !== 0) throw Error("Source changed during the history scan; recapture affected windows");
const result = { checkedAt: new Date().toISOString(), database: env.ODOO_DATABASE, windows: index.windows.length, sourceHashesVerified: true, sourceCountsAndVersionsUnchanged: true, businessWrites: 0 };
await fs.writeFile(args.get("index") + ".revalidation.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
