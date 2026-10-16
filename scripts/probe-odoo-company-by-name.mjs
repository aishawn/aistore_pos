import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const odoo = "https://odoo.orithos.com.au";
const db = env.ODOO_DATABASE || "aipos";
const user = env.ODOO_SERVICE_USERNAME || env.ODOO_USER;
const pass = env.ODOO_SERVICE_PASSWORD || env.ODOO_PASS;
const companyName = process.argv[2] || "Probe Co 2";

async function fetchRetry(url, init, tries = 5) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}
async function readJson(res) {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t.slice(0, 400) }; }
}

const auth = await fetchRetry(`${odoo}/web/session/authenticate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db, login: user, password: pass }, id: 1 }),
});
const sid = (auth.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).find((c) => c.startsWith("session_id="))?.split("=")[1];
if (!sid) throw new Error("no session");

async function call(model, method, args, kwargs = {}) {
  const r = await fetchRetry(`${odoo}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sid}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
  });
  return readJson(r);
}

const companies = await call("res.company", "search_read", [[["name", "ilike", companyName]]], {
  fields: ["id", "name"],
  limit: 5,
});
console.log("companies", JSON.stringify(companies.result || companies.error, null, 2));
const companyId = companies.result?.[0]?.id;
if (!companyId) process.exit(2);

const ctx = { allowed_company_ids: [companyId], force_company: companyId };
const configs = await call("pos.config", "search_read", [[["company_id", "=", companyId]]], {
  fields: ["id", "name", "company_id"],
  context: ctx,
});
console.log("pos.configs", JSON.stringify(configs.result || configs.error, null, 2));

const products = await call("product.template", "search_read", [[["company_id", "=", companyId], ["available_in_pos", "=", true]]], {
  fields: ["id", "name", "default_code", "list_price"],
  limit: 20,
  context: ctx,
});
console.log("pos products", JSON.stringify(products.result || products.error, null, 2));
