import assert from "node:assert/strict";
import test from "node:test";
import { showsFloatingAiLauncher, usesHeaderAiEntry } from "./ai-entry-placement.ts";

test("header AI entry is retired in favour of the floating launcher", () => {
  for (const route of ["/", "/overview", "/register/odoo", "/close", "/stock/list", "/customers", "/suppliers/new"]) {
    assert.equal(usesHeaderAiEntry(route), false);
    assert.equal(showsFloatingAiLauncher(route), true);
  }
});
