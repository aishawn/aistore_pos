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

test("expensive replenishment failures wait for explicit Retry; ordinary reads retain recovery", async () => {
  for (const status of [404, 502, 503, 504]) {
    for (const [url, expectedCalls] of [["/api/odoo/replenishment?coverageDays=21", 1], ["/api/odoo/products", 2]]) {
      let calls = 0;
      const exports = {};
      vm.runInNewContext(compiled, {
        exports, Request, Response, URL,
        fetch: async () => { calls++; return Response.json({ message: "unavailable" }, { status }); },
        require: (name) => {
          if (name === "./api") return { isLocalPreviewSession: () => true };
          if (name === "./odoo-quote-timeout") return {};
          if (name === "./odoo-read-cache") return { cachedOdooRead: (_path, init, transport) => transport(init), clearOdooReadCache: () => undefined, setOdooReadIdentity: () => undefined };
          throw new Error("Unexpected dependency: " + name);
        },
      });
      const result = await exports.fetchOdooRoute(url, { method: "GET" });
      assert.equal(result.status, status);
      assert.equal(calls, expectedCalls, `${url}: HTTP ${status}`);
    }
  }
});

test("only margin report POSTs replay after session recovery; writes and expensive failures do not", async () => {
  for (const url of ["/api/odoo/shopfront-margin", "/api/odoo/cost-reconciliation", "/api/odoo/checkout", "/api/odoo/cost-reconciliation/apply"]) {
    for (const initialStatus of [401, 503]) {
      const calls = [];
      const exports = {};
      vm.runInNewContext(compiled, {
        exports, Request, Response, URL,
        fetch: async (path) => {
          calls.push(path);
          if (path === "/api/odoo/session") return Response.json({ autoRecoverConfigured: true });
          if (path === "/api/auth/refresh") return Response.json({ code: 0 });
          return calls.filter(x => x === url).length === 1
            ? Response.json({ message: "unavailable" }, { status: initialStatus }) : Response.json({ ok: true });
        },
        require: (name) => {
          if (name === "./api") return { isLocalPreviewSession: () => false };
          if (name === "./odoo-quote-timeout") return {};
          if (name === "./odoo-read-cache") return { cachedOdooRead: (_path, init, transport) => transport(init), clearOdooReadCache: () => undefined, setOdooReadIdentity: () => undefined };
          throw new Error("Unexpected dependency: " + name);
        },
      });
      const result = await exports.fetchOdooRoute(url, { method: "POST", body: "{}" });
      const replay = initialStatus === 401 && ["/api/odoo/shopfront-margin", "/api/odoo/cost-reconciliation"].includes(url);
      assert.equal(result.status, replay ? 200 : initialStatus, url);
      assert.equal(calls.filter(x => x === url).length, replay ? 2 : 1, url);
    }
  }
});
