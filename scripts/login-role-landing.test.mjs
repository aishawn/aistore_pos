import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loginQueryReturnPath,
  normalizeAuthReturnPath,
  storeLandingPath,
} from "../pos-ui/src/lib/tenant-host.ts";

test("Auth return paths drop nested next query params", () => {
  assert.equal(normalizeAuthReturnPath("/dashboard?next=%2Fdashboard"), "/dashboard");
  assert.equal(loginQueryReturnPath("/dashboard", "?next=%2Fdashboard"), "/dashboard");
  assert.equal(normalizeAuthReturnPath("/login?next=%2Fdashboard"), null);
});

test("Store login defaults follow the role, including a root-page return", () => {
  const admin = { isAdmin: true, roleCode: "ADMIN" };
  const manager = { isAdmin: false, roleCode: "MANAGER" };
  const clerk = { isAdmin: false, roleCode: "CLERK" };
  for (const next of [null, "/"]) {
    assert.equal(storeLandingPath(next, "web", admin), "/dashboard");
    assert.equal(storeLandingPath(next, "web", manager), "/dashboard");
    assert.equal(storeLandingPath(next, "web", clerk), "/sell");
  }
  assert.equal(storeLandingPath(null, "web", { isAdmin: false, roleCode: "ADMIN" }), "/dashboard");
  assert.equal(storeLandingPath(null, "web", { isAdmin: true }), "/dashboard");
  assert.equal(storeLandingPath(null, "web", { isAdmin: false, roleCode: "NONE" }), "/sell");
  assert.equal(storeLandingPath("/customers/odoo", "web", clerk), "/customers/odoo");
  assert.equal(storeLandingPath("/?sale=42", "web", manager), "/?sale=42");
  assert.equal(storeLandingPath(null, "mobile", clerk), "/m");
  assert.equal(storeLandingPath("//external.invalid", "web", clerk), "/sell");
});
