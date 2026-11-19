import assert from "node:assert/strict";
import { test } from "node:test";
import { applyShopfrontSyncNotification } from "./shopfront-sync-notification.ts";

test("only completed syncs advance the freshness stamp while every status clears report caches", async () => {
  for (const status of ["completed", "partial", "failed"] as const) {
    const recorded: Array<[string, number]> = [];
    const cleared: string[] = [];

    await applyShopfrontSyncNotification({
      status,
      hosts: ["skr.orithos.com.au", "demo.orithos.com.au"],
      at: 1234,
      record: async (host, at) => { recorded.push([host, at]); },
      clear: prefix => { cleared.push(prefix); },
    });

    assert.deepEqual(recorded, status === "completed"
      ? [["skr.orithos.com.au", 1234], ["demo.orithos.com.au", 1234]]
      : []);
    assert.deepEqual(cleared, ["skr.orithos.com.au|", "demo.orithos.com.au|"]);
  }
});
