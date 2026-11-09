import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedShopfrontSourceStore, verifiedShopfrontSourceStoreFromHost } from "./shopfront-store-scope.ts";

test("maps verified SKR and demo bindings to the shared Shopfront source", () => {
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "skr", r2Prefix: "shopfront/skr/", odooProvisionStatus: "ready" }), "skr");
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "demo", r2Prefix: "shopfront/demo/", odooProvisionStatus: "ready" }), "skr");
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "demo", r2Prefix: "shopfront/demo/", odooProvisionStatus: "pending" }), null);
  assert.equal(verifiedShopfrontSourceStore({ subdomain: "other", r2Prefix: "shopfront/other/", odooProvisionStatus: "ready" }), null);
});

test("maps only the configured store hosts to the shared read-only source", () => {
  assert.equal(verifiedShopfrontSourceStoreFromHost("skr.orithos.com.au"), "skr");
  assert.equal(verifiedShopfrontSourceStoreFromHost("demo.orithos.com.au:443"), "skr");
  assert.equal(verifiedShopfrontSourceStoreFromHost("skr.orithos.com.au, attacker.example"), "skr");
  assert.equal(verifiedShopfrontSourceStoreFromHost("attacker.example"), null);
  assert.equal(verifiedShopfrontSourceStoreFromHost(null), null);
});
