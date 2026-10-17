import fs from "node:fs";
import { randomUUID } from "node:crypto";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const env = Object.fromEntries(
  fs.readFileSync(`${root}/.env`, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const app = "https://app.orithos.com.au";
const requestedVendorId = Number(process.env.PILOT_VENDOR_ID || 0);
const slug = process.env.PILOT_SLUG || `codex-close-${Date.now().toString().slice(-10)}`;
const store = `https://${slug}.orithos.com.au`;
const ownerUsername = `closeuat${Date.now().toString().slice(-7)}`;
const ownerPassword = `CodexUAT-${Date.now()}-Safe`;
const evidence = { generatedAt: new Date().toISOString(), slug, checks: [] };

function cookieJar(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((value) => value.split(";")[0])
    .join("; ");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

async function readOdooSessionSnapshot(companyId, sessionId) {
  const base = (env.ODOO_BASE_URL || "https://odoo.orithos.com.au").replace(/\/+$/, "");
  const database = env.ODOO_DATABASE || "aipos";
  const username = env.ODOO_SERVICE_USERNAME || env.ODOO_USER;
  const password = env.ODOO_SERVICE_PASSWORD || env.ODOO_PASS;
  const auth = await fetch(`${base}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db: database, login: username, password }, id: Date.now() }),
  });
  const authBody = await readJson(auth);
  const sessionIdCookie = (auth.headers.getSetCookie?.() || [])
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("session_id="));
  if (!sessionIdCookie || !authBody.result?.uid) return null;
  const rpc = await fetch(`${base}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessionIdCookie },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        model: "pos.session",
        method: "search_read",
        args: [[['id', '=', sessionId]]],
        kwargs: {
          fields: ["id", "state", "cash_register_balance_start", "cash_register_balance_end", "cash_register_balance_end_real", "cash_register_difference"],
          limit: 1,
          context: { allowed_company_ids: [companyId], force_company: companyId },
        },
      },
      id: Date.now(),
    }),
  });
  const body = await readJson(rpc);
  return body.result?.[0] || null;
}

function check(name, passed, detail = {}) {
  evidence.checks.push({ name, status: passed ? "PASS" : "FAIL", ...detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail);
}

let appCookies = "";
let vendorId = null;
try {
  let response = await fetch(`${app}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: app },
    body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }),
  });
  let body = await readJson(response);
  appCookies = cookieJar(response);
  check("platform.login", response.ok && body.code === 0 && Boolean(appCookies), { httpStatus: response.status });
  if (!appCookies) throw new Error("platform login did not return an auth cookie");

  let binding;
  if (requestedVendorId > 0) {
    vendorId = requestedVendorId;
    response = await fetch(`${app}/api/admin/tenants/${vendorId}`, {
      headers: { Origin: app, Cookie: appCookies },
    });
    body = await readJson(response);
    binding = body.data?.odooBinding || body.data || {};
    check("tenant.existing", response.ok && body.code === 0, { httpStatus: response.status, vendorId });
  } else {
    response = await fetch(`${app}/api/admin/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: app, Cookie: appCookies },
      body: JSON.stringify({
        organisationName: `Codex Close Income UAT ${slug}`,
        subdomain: slug,
        ownerName: "Close UAT Owner",
        username: ownerUsername,
        email: `${ownerUsername}@example.invalid`,
        password: ownerPassword,
        phone: "0400000000",
        trialDays: 1,
        outlets: [
          { name: "Main Store", registerCount: 2 },
          { name: "Back Bar", registerCount: 1 },
        ],
        dummyData: true,
      }),
    });
    body = await readJson(response);
    vendorId = body.data?.vendorId;
    check("tenant.create", response.ok && body.code === 0 && Boolean(vendorId), {
      httpStatus: response.status,
      vendorId,
      message: body.message,
    });
    if (!vendorId) throw new Error(body.message || "tenant create failed");
    for (let attempt = 1; attempt <= 36; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      response = await fetch(`${app}/api/admin/tenants/${vendorId}`, {
        headers: { Origin: app, Cookie: appCookies },
      });
      body = await readJson(response);
      binding = body.data?.odooBinding || body.data || {};
      console.log("provision", attempt, binding.odooProvisionStatus, binding.odooCompanyId, binding.odooPosConfigId);
      if (binding.odooProvisionStatus === "ready") break;
    }
  }
  check("tenant.provision.ready", binding?.odooProvisionStatus === "ready", {
    companyId: binding?.odooCompanyId,
    posConfigId: binding?.odooPosConfigId,
    status: binding?.odooProvisionStatus,
  });
  if (binding?.odooProvisionStatus !== "ready") throw new Error("provisioning did not become ready");

  response = await fetch(`${app}/api/admin/tenants/${vendorId}/owner/bootstrap`, {
    method: "POST",
    headers: { Origin: app, Cookie: appCookies },
  });
  body = await readJson(response);
  const bootstrapToken = body.data?.bootstrapToken;
  check("owner.bootstrap", response.ok && body.code === 0 && Boolean(bootstrapToken), { httpStatus: response.status });
  if (!bootstrapToken) throw new Error("owner bootstrap token unavailable");

  response = await fetch(`${store}/api/auth/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: store },
    body: JSON.stringify({ token: bootstrapToken }),
  });
  body = await readJson(response);
  let storeCookies = cookieJar(response);
  check("store.bootstrap", response.ok && body.code === 0 && Boolean(storeCookies), { httpStatus: response.status });
  if (!storeCookies) throw new Error("store bootstrap did not return an auth cookie");

  const auth = { Origin: store, Cookie: storeCookies };
  response = await fetch(`${store}/api/odoo/session`, { headers: auth });
  body = await readJson(response);
  storeCookies = [storeCookies, cookieJar(response)].filter(Boolean).join("; ");
  check("odoo.session", response.ok && Boolean(body.user), {
    httpStatus: response.status,
    allowedCompanyIds: body.user?.allowedCompanyIds,
  });

  response = await fetch(`${store}/api/odoo/records`, {
    method: "POST",
    headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "products", limit: 50 }),
  });
  body = await readJson(response);
  const products = body.items || [];
  check("dummy.catalog", response.ok && products.length >= 8, { httpStatus: response.status, productCount: products.length });

  response = await fetch(`${store}/api/odoo/pos-bootstrap`, { headers: { ...auth, Cookie: storeCookies } });
  body = await readJson(response);
  const configs = body.configs || [];
  const config = configs.find((item) => item.session || item.currentSessionId || item.current_session_id) || configs[0];
  const session = config?.session || {};
  const configId = config?.id;
  const sessionId = session.id || config?.currentSessionId || config?.current_session_id;
  const cashMethod = (config?.paymentMethods || []).find((method) => method.is_cash_count) || (config?.paymentMethods || [])[0];
  const expectedCash = session.cashRegisterBalanceEnd
    ?? session.cash_register_balance_end
    ?? config?.expectedCashEnd
    ?? config?.expected_cash_end;
  check("pos.bootstrap", response.ok && Boolean(configId), {
    httpStatus: response.status,
    configId,
    sessionId,
    expectedCash,
    registerCount: configs.length,
  });
  if (!configId) throw new Error("no POS config returned");

  const product = products[0];
  let saleTotal = null;
  if (product?.id && cashMethod?.id) {
    response = await fetch(`${store}/api/odoo/checkout/quote`, {
      method: "POST",
      headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
      body: JSON.stringify({
        configId,
        paymentMethodId: cashMethod.id,
        lines: [{ productId: product.id, quantity: 1 }],
      }),
    });
    const quote = await readJson(response);
    saleTotal = typeof quote.total === "number" ? quote.total : null;
    check("cash.sale.quote", response.ok && saleTotal != null, {
      httpStatus: response.status,
      total: saleTotal,
      productId: product.id,
      paymentMethodId: cashMethod.id,
    });
    if (saleTotal != null) {
      response = await fetch(`${store}/api/odoo/checkout`, {
        method: "POST",
        headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
        body: JSON.stringify({
          configId,
          paymentMethodId: cashMethod.id,
          orderUuid: randomUUID(),
          tendered: saleTotal,
          lines: [{ productId: product.id, quantity: 1 }],
        }),
      });
      const sale = await readJson(response);
      check("cash.sale", response.ok && typeof sale.saleId === "number", {
        httpStatus: response.status,
        saleId: sale.saleId,
        receipt: sale.receipt,
        total: sale.total,
        message: sale.message,
      });
    }
  } else {
    check("cash.sale", false, { reason: "cash payment method or product was not returned" });
  }

  response = await fetch(`${store}/api/odoo/session/close`, {
    method: "POST",
    headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
    body: JSON.stringify({ configId }),
  });
  body = await readJson(response);
  check("close.requiresCountedCash", response.status === 422, { httpStatus: response.status, message: body.message });

  if (expectedCash == null && sessionId) {
    response = await fetch(`${store}/api/odoo/records`, {
      method: "POST",
      headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "sessions", limit: 20 }),
    });
    body = await readJson(response);
    const sessions = body.items || [];
    const current = sessions.find((item) => item.id === sessionId) || sessions[0];
    evidence.sessionRecords = sessions.slice(0, 3);
    evidence.expectedCashFromRecords = current?.cash_register_balance_end ?? current?.cashRegisterBalanceEnd;
  }

  const countedCash = expectedCash ?? evidence.expectedCashFromRecords ?? saleTotal;
  const companyId = binding?.odooCompanyId;
  const beforeClose = companyId && sessionId ? await readOdooSessionSnapshot(companyId, sessionId) : null;
  if (beforeClose) {
    evidence.odooBeforeClose = beforeClose;
  }
  const verifiedExpectedCash = beforeClose?.cash_register_balance_end;
  const finalCountedCash = verifiedExpectedCash ?? countedCash;
  if (finalCountedCash == null) {
    check("close.withExpectedCash", false, { reason: "expected cash was not exposed by the API" });
  } else {
    response = await fetch(`${store}/api/odoo/session/close`, {
      method: "POST",
      headers: { ...auth, Cookie: storeCookies, "Content-Type": "application/json" },
      body: JSON.stringify({ configId, countedCash: Number(finalCountedCash) }),
    });
    body = await readJson(response);
    check("close.withExpectedCash", response.ok, { httpStatus: response.status, message: body.message, countedCash: Number(finalCountedCash) });
    const afterClose = companyId && sessionId ? await readOdooSessionSnapshot(companyId, sessionId) : null;
    if (afterClose) {
      evidence.odooAfterClose = afterClose;
      check("close.stateAndCash", afterClose.state === "closed"
        && Number(afterClose.cash_register_balance_end_real) === Number(finalCountedCash), {
        state: afterClose.state,
        countedCash: afterClose.cash_register_balance_end_real,
        expectedCash: afterClose.cash_register_balance_end,
        difference: afterClose.cash_register_difference,
      });
    }
  }
} finally {
  if (vendorId && appCookies) {
    const response = await fetch(`${app}/api/admin/tenants/${vendorId}`, {
      method: "DELETE",
      headers: { Origin: app, Cookie: appCookies },
    });
    const body = await readJson(response);
    check("tenant.delete", response.ok && body.code === 0, { httpStatus: response.status, status: body.data?.status });
    const deleted = await fetch(`${store}/api/auth/me`, { headers: { Origin: store } });
    check("deleted.auth", deleted.status === 402 || deleted.status === 401, { httpStatus: deleted.status });
  }
  fs.writeFileSync(`${root}/docs/UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(evidence, null, 2));
}
