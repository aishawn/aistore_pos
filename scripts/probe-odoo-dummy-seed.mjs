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

const companyId = 2;
const ctx = { allowed_company_ids: [companyId], force_company: companyId };
const count = await call("product.product", "search_count", [[["company_id", "=", companyId], ["available_in_pos", "=", true]]], { context: ctx });
console.log("count", count.result ?? count.error);

let tax = await call("account.tax", "search_read", [[["company_id", "=", companyId], ["type_tax_use", "=", "sale"], ["amount", "=", 10]]], { fields: ["id", "name"], limit: 1, context: ctx });
let taxId = tax.result?.[0]?.id;
if (!taxId) {
  const created = await call("account.tax", "create", [{ name: "GST 10%", amount: 10, amount_type: "percent", type_tax_use: "sale", price_include: true, company_id: companyId }], { context: ctx });
  console.log("tax create", created.result || created.error?.data?.message || created.error);
  taxId = created.result;
} else {
  console.log("tax existing", taxId);
}

const prod = await call("product.template", "create", [{
  name: "DEMO Shiraz 750ml",
  default_code: "DEMO-SHIRAZ",
  list_price: 28.5,
  available_in_pos: true,
  sale_ok: true,
  purchase_ok: true,
  type: "consu",
  company_id: companyId,
  taxes_id: taxId ? [[6, 0, [taxId]]] : [],
}], { context: ctx });
console.log("product", prod.result || prod.error?.data?.message || prod.error);

const products = await call("product.product", "search_read", [[["company_id", "=", companyId], ["available_in_pos", "=", true]]], { fields: ["id", "name", "default_code"], limit: 10, context: ctx });
console.log("products", products.result || products.error);
