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

async function rpc(path, params, sessionId) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionId ? { Cookie: `session_id=${sessionId}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ODOO_HTTP_${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error("ODOO_RPC_FAILED");
  return { result: payload.result, response, envelopeKeys: Object.keys(payload) };
}

const auth = await rpc("/web/session/authenticate", { db: database, login: username, password });
if (!auth.result?.uid) throw new Error("ODOO_AUTH_FAILED");
const cookie = auth.response.headers.getSetCookie?.().find((value) => /session_id=/.test(value));
const sessionId = cookie?.match(/session_id=([^;]+)/)?.[1];
if (!sessionId) throw new Error("ODOO_SESSION_COOKIE_MISSING");
const result = await rpc("/web/dataset/call_kw", { model: "purchase.order", method: "fields_get", args: [["note", "notes"]], kwargs: { attributes: ["type", "string"] } }, sessionId);
const fieldName = result.result?.note ? "note" : result.result?.notes ? "notes" : null;
const field = fieldName ? result.result[fieldName] : null;
if (!field) throw new Error("PURCHASE_APPROVAL_NOTES_FIELD_UNAVAILABLE");
const orderFields = await rpc("/web/dataset/call_kw", { model: "purchase.order", method: "fields_get", args: [["message_ids"]], kwargs: { attributes: ["type"] } }, sessionId);
const chatterFields = await rpc("/web/dataset/call_kw", { model: "mail.message", method: "fields_get", args: [["body", "model", "res_id", "subtype_id", "author_id", "date"]], kwargs: { attributes: ["type"] } }, sessionId);
const subtype = await rpc("/web/dataset/call_kw", { model: "ir.model.data", method: "search_read", args: [[ ["module", "=", "mail"], ["name", "=", "mt_note"] ]], kwargs: { fields: ["model", "res_id"], limit: 1 } }, sessionId);
if (!orderFields.result?.message_ids || !chatterFields.result?.body || !subtype.result?.length) throw new Error("ODOO_INTERNAL_CHATTER_SCHEMA_UNAVAILABLE");
console.log(JSON.stringify({ status: "PASS", database, supplierFacingField: { name: fieldName, type: field.type, label: field.string }, internalChatter: { orderField: orderFields.result.message_ids.type, messageBodyType: chatterFields.result.body.type, internalNoteSubtype: subtype.result[0] } }));
