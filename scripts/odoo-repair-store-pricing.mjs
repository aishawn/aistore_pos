/**
 * Repair Odoo POS pricelist binding for named store subdomains (read + limited Odoo writes).
 * Uses INITIAL_ADMIN_PASSWORD + ODOO_SERVICE_* from repo root .env (never logged).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const appBase = (env.PILOT_APP_URL || "https://app.orithos.com.au").replace(/\/+$/, "");
const odooBase = (env.ODOO_BASE_URL || "").replace(/\/+$/, "");
const odooDb = env.ODOO_DATABASE || "aipos";
const odooUser = env.ODOO_SERVICE_USERNAME || env.ODOO_USER || "";
const odooPass = env.ODOO_SERVICE_PASSWORD || env.ODOO_PASS || "";
const adminPassword = env.INITIAL_ADMIN_PASSWORD || "";
const targetSlugs = (env.REPAIR_STORE_SLUGS || "demo,skr").split(",").map((s) => s.trim()).filter(Boolean);

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { res, body };
}

async function platformLogin() {
  const { res, body } = await jsonFetch(`${appBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appBase },
    body: JSON.stringify({ username: "admin", password: adminPassword }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader = setCookie.map((part) => part.split(";")[0]).join("; ");
  const token = body?.data?.accessToken;
  if (!res.ok || body?.code !== 0 || (!token && !cookieHeader.includes("orithos_access_token"))) {
    fail(`Platform login failed (${res.status})`);
  }
  return token ? { authorization: `Bearer ${token}` } : { cookie: cookieHeader };
}

async function odooAuthenticate() {
  const { res, body } = await jsonFetch(`${odooBase}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { db: odooDb, login: odooUser, password: odooPass },
      id: 1,
    }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const sessionCookie = setCookie.find((c) => c.startsWith("session_id="));
  const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
  if (!sessionId || body?.error) fail("Odoo service authentication failed");
  return sessionId;
}

async function odooCallKw(sessionId, model, method, args, kwargs = {}) {
  const { res, body } = await jsonFetch(`${odooBase}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
  });
  if (body?.error) {
    const msg = body.error?.data?.message || body.error?.message || "Odoo RPC error";
    throw new Error(`${model}.${method}: ${msg}`);
  }
  return body?.result;
}

function companyKwargs(companyId) {
  return { context: { allowed_company_ids: [companyId], force_company: companyId } };
}

async function resolveCurrencyId(sessionId, companyId) {
  const companies = await odooCallKw(
    sessionId,
    "res.company",
    "search_read",
    [[["id", "=", companyId]]],
    { fields: ["currency_id", "country_id", "account_fiscal_country_id"], limit: 1, ...companyKwargs(companyId) },
  );
  const row = companies?.[0];
  if (!row) throw new Error(`Company ${companyId} not found`);
  let currencyId = Array.isArray(row.currency_id) ? row.currency_id[0] : 0;
  const countryId = Array.isArray(row.account_fiscal_country_id)
    ? row.account_fiscal_country_id[0]
    : Array.isArray(row.country_id)
      ? row.country_id[0]
      : 0;
  let code = "AUD";
  if (countryId) {
    const countries = await odooCallKw(sessionId, "res.country", "read", [[countryId]], { fields: ["code"] });
    const c = countries?.[0]?.code;
    if (c === "NZ") code = "NZD";
    else if (c === "US") code = "USD";
    else if (c === "GB") code = "GBP";
  }
  const currencies = await odooCallKw(sessionId, "res.currency", "search_read", [[["name", "=", code]]], {
    fields: ["id"],
    limit: 1,
  });
  const target = currencies?.[0]?.id;
  if (target && currencyId !== target) {
    await odooCallKw(sessionId, "res.company", "write", [[companyId], { currency_id: target }], companyKwargs(companyId));
    currencyId = target;
  }
  if (!currencyId) throw new Error(`No currency for company ${companyId}`);
  return currencyId;
}

async function ensurePricelist(sessionId, companyId, label) {
  const currencyId = await resolveCurrencyId(sessionId, companyId);
  let lists = await odooCallKw(
    sessionId,
    "product.pricelist",
    "search_read",
    [[["company_id", "=", companyId], ["currency_id", "=", currencyId], ["active", "=", true]]],
    { fields: ["id", "name"], limit: 1, order: "id asc", ...companyKwargs(companyId) },
  );
  if (lists?.length) return lists[0].id;
  const name = `${label} Prices`;
  return odooCallKw(
    sessionId,
    "product.pricelist",
    "create",
    [{ name, company_id: companyId, currency_id: currencyId, active: true }],
    companyKwargs(companyId),
  );
}

async function repairPosConfigs(sessionId, companyId, label) {
  const pricelistId = await ensurePricelist(sessionId, companyId, label);
  const configs = await odooCallKw(
    sessionId,
    "pos.config",
    "search_read",
    [[["company_id", "=", companyId]]],
    { fields: ["id", "name", "pricelist_id", "available_pricelist_ids"], limit: 50, ...companyKwargs(companyId) },
  );
  const repaired = [];
  for (const config of configs || []) {
    const current = Array.isArray(config.pricelist_id) ? config.pricelist_id[0] : 0;
    const available = config.available_pricelist_ids || [];
    const ok = current === pricelistId && available.includes(pricelistId);
    if (!ok) {
      await odooCallKw(
        sessionId,
        "pos.config",
        "write",
        [[config.id], { pricelist_id: pricelistId, available_pricelist_ids: [[6, 0, [pricelistId]]] }],
        companyKwargs(companyId),
      );
      repaired.push(config.name);
    }
  }
  return { pricelistId, configCount: configs?.length || 0, repaired };
}

async function probeQuoteMethod(sessionId, companyId, configId) {
  const products = await odooCallKw(
    sessionId,
    "product.product",
    "search_read",
    [[["available_in_pos", "=", true]]],
    { fields: ["id", "name"], limit: 1, ...companyKwargs(companyId) },
  );
  const productId = products?.[0]?.id;
  if (!productId) return { ok: false, reason: "no POS product" };
  try {
    const quote = await odooCallKw(
      sessionId,
      "pos.config",
      "orithos_quote_prices",
      [[configId], [{ productId, quantity: 1 }], false],
      companyKwargs(companyId),
    );
    const price = quote?.prices?.[0]?.unitPrice;
    return {
      ok: Number.isFinite(price) && price >= 0,
      productId,
      unitPrice: price,
      currency: quote?.currency,
      priceSource: quote?.priceSourceName,
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function platformHeaders(auth) {
  const headers = { Origin: appBase };
  if (auth.authorization) headers.Authorization = auth.authorization;
  if (auth.cookie) headers.Cookie = auth.cookie;
  return headers;
}

async function reprovisionViaPlatform(auth, vendorId) {
  const { res, body } = await jsonFetch(`${appBase}/api/admin/tenants/${vendorId}/odoo-provision`, {
    method: "POST",
    headers: { ...platformHeaders(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Automated POS pricelist repair" }),
  });
  return { httpStatus: res.status, code: body?.code, status: body?.data?.odooProvisionStatus, error: body?.data?.odooProvisionError };
}

async function main() {
  if (!adminPassword) fail("INITIAL_ADMIN_PASSWORD missing");
  if (!odooBase || !odooUser || !odooPass) fail("ODOO_BASE_URL / ODOO_SERVICE_* missing");

  const auth = await platformLogin();
  const { res, body } = await jsonFetch(`${appBase}/api/admin/tenants?page=1&size=100`, {
    headers: platformHeaders(auth),
  });
  const items = body?.data?.items || [];
  if (!res.ok || body?.code !== 0) fail("Could not list tenants");

  const sessionId = await odooAuthenticate();
  const report = [];

  for (const slug of targetSlugs) {
    const vendor = items.find((v) => v.subdomain === slug && v.status !== "deleted");
    if (!vendor) {
      report.push({ slug, error: "tenant not found" });
      continue;
    }
    const detailRes = await jsonFetch(`${appBase}/api/admin/tenants/${vendor.id}`, {
      headers: platformHeaders(auth),
    });
    const detail = detailRes.body?.data;
    const companyId = detail?.odooBinding?.odooCompanyId ?? detail?.odooCompanyId;
    const configId = detail?.odooBinding?.odooPosConfigId ?? detail?.odooPosConfigId;
    if (!companyId) {
      report.push({ slug, vendorId: vendor.id, error: "no odoo company binding" });
      continue;
    }

    const reprovision = env.REPAIR_RUN_REPROVISION === "1"
      ? await reprovisionViaPlatform(auth, vendor.id)
      : { skipped: true, note: "Set REPAIR_RUN_REPROVISION=1 to retry full Odoo provision" };
    const repair = await repairPosConfigs(sessionId, companyId, vendor.name || slug);
    const configs = await odooCallKw(
      sessionId,
      "pos.config",
      "search_read",
      [[["company_id", "=", companyId]]],
      { fields: ["id", "name"], limit: 1, order: "id asc", ...companyKwargs(companyId) },
    );
    const probeConfigId = configId || configs?.[0]?.id;
    const probe = probeConfigId ? await probeQuoteMethod(sessionId, companyId, probeConfigId) : { ok: false, reason: "no pos config" };

    report.push({
      slug,
      vendorId: vendor.id,
      odooCompanyId: companyId,
      odooPosConfigId: probeConfigId,
      reprovision,
      repair,
      quoteProbe: probe,
    });
  }

  console.log(JSON.stringify({ appBase, odooBase, odooDb, report }, null, 2));
  const allQuotesOk = report.every((row) => row.quoteProbe?.ok);
  process.exit(allQuotesOk ? 0 : 2);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
