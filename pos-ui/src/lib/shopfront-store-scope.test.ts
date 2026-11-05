import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedShopfrontSourceStore } from "./shopfront-store-scope.ts";

test("maps verified SKR and demo bindings to the shared Shopfront source", () => {
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "skr", r2Prefix: "shopfront/skr/", odooProvisionStatus: "ready" }), "skr");
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "demo", r2Prefix: "shopfront/demo/", odooProvisionStatus: "ready" }), "skr");
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "demo", r2Prefix: "shopfront/demo/", odooProvisionStatus: "pending" }), null);
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "other", r2Prefix: "shopfront/other/", odooProvisionStatus: "ready" }), null);
});
