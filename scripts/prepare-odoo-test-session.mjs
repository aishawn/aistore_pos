/**
 * One-shot ops helper: set demo wine test stock and open orithos_store1 POS session.
 * Does NOT create sales, refunds, or purchase confirmations.
 *
 * Usage (from repo root):
 *   node scripts/prepare-odoo-test-session.mjs
 *
 * Reads ODOO_* from env; falls back to known pilot host/db. Pass credentials via env:
 *   ODOO_SERVICE_USERNAME / ODOO_SERVICE_PASSWORD
 */
const baseUrl = (process.env.ODOO_BASE_URL || "https://odoo.orithos.com.au").replace(/\/+$/, "");
const database = process.env.ODOO_DATABASE || "aipos";
const username = process.env.ODOO_SERVICE_USERNAME || process.env.ODOO_USER;
const password = process.env.ODOO_SERVICE_PASSWORD || process.env.ODOO_PASS;
const TEST_QTY = Number(process.env.ODOO_TEST_QTY || 12);
const DEMO_CODES = ["DEMO-SB-2024", "DEMO-SHIRAZ21"];

if (!username || !password) {
  console.error("Set ODOO_SERVICE_USERNAME and ODOO_SERVICE_PASSWORD (or ODOO_USER / ODOO_PASS).");
  process.exit(1);
}

async function rpc(path, params, sessionId) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { Cookie: `session_id=${sessionId}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
  const payload = await res.json();
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Odoo RPC error");
  }
  return { result: payload.result, res };
}

async function callKw(sessionId, model, method, args = [], kwargs = {}) {
  const { result } = await rpc("/web/dataset/call_kw", { model, method, args, kwargs }, sessionId);
  return result;
}

async function main() {
  const auth = await rpc("/web/session/authenticate", { db: database, login: username, password });
  if (!auth.result?.uid) throw new Error("Odoo authentication failed");
  const setCookie = auth.res.headers.getSetCookie?.() || [];
  const sessionCookie = setCookie.find((v) => /session_id=/.test(v));
  const sessionId = sessionCookie?.match(/session_id=([^;]+)/)?.[1];
  if (!sessionId) throw new Error("No session_id cookie from Odoo");

  console.log(`Authenticated as uid=${auth.result.uid}`);

  const products = await callKw(
    sessionId,
    "product.product",
    "search_read",
    [[["default_code", "in", DEMO_CODES]]],
    { fields: ["id", "name", "default_code", "qty_available"], limit: 10 },
  );
  console.log("Demo products:", products);

  for (const product of products) {
    const quants = await callKw(
      sessionId,
      "stock.quant",
      "search_read",
      [[["product_id", "=", product.id], ["location_id.usage", "=", "internal"]]],
      { fields: ["id", "quantity", "inventory_quantity", "location_id"], limit: 5 },
    );
    let quantId = quants[0]?.id;
    if (!quantId) {
      const locations = await callKw(
        sessionId,
        "stock.location",
        "search_read",
        [[["usage", "=", "internal"], ["company_id", "=", 1]]],
        { fields: ["id", "complete_name"], limit: 1 },
      );
      if (!locations[0]) throw new Error("No internal stock location found");
      quantId = await callKw(sessionId, "stock.quant", "create", [{
        product_id: product.id,
        location_id: locations[0].id,
        inventory_quantity: TEST_QTY,
      }]);
    } else {
      await callKw(sessionId, "stock.quant", "write", [[quantId], { inventory_quantity: TEST_QTY }]);
    }
    await callKw(sessionId, "stock.quant", "action_apply_inventory", [[quantId]]);
    console.log(`Set ${product.default_code} inventory_quantity=${TEST_QTY} (quant ${quantId})`);
  }

  const configs = await callKw(
    sessionId,
    "pos.config",
    "search_read",
    [[["name", "ilike", "orithos_store1"]]],
    { fields: ["id", "name", "current_session_id"], limit: 5 },
  );
  const config = configs[0];
  if (!config) throw new Error("orithos_store1 POS config not found");
  if (Array.isArray(config.current_session_id) && config.current_session_id[0]) {
    console.log(`POS session already open: ${config.current_session_id[1]} (${config.current_session_id[0]})`);
  } else {
    // Odoo 17+/18: create a draft/open session on the config.
    const sessionCreateId = await callKw(sessionId, "pos.session", "create", [{
      config_id: config.id,
      user_id: auth.result.uid,
    }]);
    try {
      await callKw(sessionId, "pos.session", "set_opening_control", [[sessionCreateId], 0.0, "pilot test open"]);
    } catch (err) {
      console.warn("set_opening_control:", err.message || err);
    }
    try {
      await callKw(sessionId, "pos.session", "action_pos_session_open", [[sessionCreateId]]);
    } catch (err) {
      console.warn("action_pos_session_open:", err.message || err);
    }
    const refreshed = await callKw(
      sessionId,
      "pos.config",
      "search_read",
      [[["id", "=", config.id]]],
      { fields: ["id", "name", "current_session_id"], limit: 1 },
    );
    console.log("Opened POS session:", refreshed[0]?.current_session_id || sessionCreateId);
  }

  console.log("Done. Refresh Orithos Sell (/) — do not create real sales unless this is an approved test order.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
