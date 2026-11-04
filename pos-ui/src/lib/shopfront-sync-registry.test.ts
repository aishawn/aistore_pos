import assert from "node:assert/strict";
import { test } from "node:test";
import { recordShopfrontSyncForHost, shopfrontSyncStampForHost, shopfrontSyncStampGlobal } from "./shopfront-sync-registry.ts";

test("sync stamps normalize host names and remain available in the current process", async () => {
  const host = "sync-stamp-fixture.orithos.com.au";
  const at = Date.now();
  await recordShopfrontSyncForHost(` ${host.toUpperCase()} `, at);

  assert.equal(await shopfrontSyncStampForHost(host), at);
  assert.equal(await shopfrontSyncStampForHost(host.toUpperCase()), at);
  assert.equal(await shopfrontSyncStampGlobal(), at);
  assert.equal(await shopfrontSyncStampForHost(" "), null);
});
