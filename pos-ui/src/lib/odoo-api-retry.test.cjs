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
          throw new Error("Unexpected dependency: " + name);
        },
      });
      const result = await exports.fetchOdooRoute(url, { method: "GET" });
      assert.equal(result.status, status);
      assert.equal(calls, expectedCalls, `${url}: HTTP ${status}`);
    }
  }
});
