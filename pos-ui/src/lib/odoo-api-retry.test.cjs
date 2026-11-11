const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the real API client with its two browser-only dependencies stubbed.
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, "odoo-api.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadClient(fetchImpl) {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Request, Response, URL,
    fetch: fetchImpl,
    require: (name) => {
      if (name === "./api") return { isLocalPreviewSession: () => false, api: {} };
      if (name === "./odoo-quote-timeout") return {};
      if (name === "./native-read-cache") {
        return {
          cachedNativeRead: (_path, init, transport) => transport(init),
          clearNativeReadCache: () => undefined,
          setNativeReadIdentity: () => undefined,
        };
      }
      throw new Error("Unexpected dependency: " + name);
    },
  });
  return exports;
}

test("GET Orithos reads retry once on gateway failures; POST writes do not", async () => {
  for (const status of [404, 502, 503, 504]) {
    let getCalls = 0;
    const getClient = loadClient(async () => {
      getCalls++;
      return Response.json({ message: "unavailable" }, { status });
    });
    const getResult = await getClient.fetchOdooRoute("/api/products?page=1", { method: "GET" });
    assert.equal(getResult.status, status);
    assert.equal(getCalls, 2, `GET /api/products: HTTP ${status}`);

    let postCalls = 0;
    const postClient = loadClient(async () => {
      postCalls++;
      return Response.json({ message: "unavailable" }, { status });
    });
    const postResult = await postClient.fetchOdooRoute("/api/orders", { method: "POST", body: "{}" });
    assert.equal(postResult.status, status);
    assert.equal(postCalls, 1, `POST /api/orders: HTTP ${status}`);
  }
});

test("GET 401 refreshes the Orithos session and replays; POST does not", async () => {
  const calls = [];
  const client = loadClient(async (path) => {
    calls.push(path);
    if (path === "/api/auth/refresh") return Response.json({ code: 0 });
    if (path === "/api/products") {
      return calls.filter((value) => value === "/api/products").length === 1
        ? Response.json({ message: "expired" }, { status: 401 })
        : Response.json({ ok: true });
    }
    if (path === "/api/orders") return Response.json({ message: "expired" }, { status: 401 });
    return Response.json({ message: "unexpected" }, { status: 500 });
  });

  const getResult = await client.fetchOdooRoute("/api/products", { method: "GET" });
  assert.equal(getResult.status, 200);
  assert.equal(calls.filter((value) => value === "/api/products").length, 2);
  assert.equal(calls.includes("/api/auth/refresh"), true);

  calls.length = 0;
  const postResult = await client.fetchOdooRoute("/api/orders", { method: "POST", body: "{}" });
  assert.equal(postResult.status, 401);
  assert.equal(calls.filter((value) => value === "/api/orders").length, 1);
});
