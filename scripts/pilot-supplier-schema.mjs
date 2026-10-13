import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
const base = (env.ODOO_BASE_URL || "https://odoo.orithos.com.au").replace(/\/+$/, "");
const database = env.ODOO_DATABASE || "aipos";
const username = env.ODOO_SERVICE_USERNAME || env.ODOO_USER;
const password = env.ODOO_SERVICE_PASSWORD || env.ODOO_PASS;
if (!username || !password) throw new Error("ODOO_SERVICE_CREDENTIALS_REQUIRED");

const authResponse = await fetch(`${base}/web/session/authenticate`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: database, login: username, password }, id: Date.now() }),
  signal: AbortSignal.timeout(15000),
});
if (!authResponse.ok) throw new Error(`ODOO_HTTP_${authResponse.status}`);
const auth = await authResponse.json();
if (!auth.result?.uid) throw new Error("ODOO_AUTH_FAILED");
const sessionId = authResponse.headers.getSetCookie?.().find((value) => /session_id=/.test(value))?.match(/session_id=([^;]+)/)?.[1];
if (!sessionId) throw new Error("ODOO_SESSION_COOKIE_MISSING");

const response = await fetch(`${base}/web/dataset/call_kw`, {
  method: "POST", headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
  body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: "res.partner", method: "fields_get", args: [["supplier_rank", "company_type", "is_company", "vat", "email", "phone", "ref"]], kwargs: { attributes: ["type", "string", "readonly", "required"] } }, id: Date.now() }),
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`ODOO_HTTP_${response.status}`);
const payload = await response.json();
if (payload.error || !payload.result?.supplier_rank || !payload.result?.vat) throw new Error("ODOO_SUPPLIER_SCHEMA_UNAVAILABLE");
console.log(JSON.stringify({ status: "PASS", database, fields: payload.result }));
