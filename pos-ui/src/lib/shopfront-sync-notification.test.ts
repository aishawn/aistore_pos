import assert from "node:assert/strict";
import { test } from "node:test";
import { applyShopfrontSyncNotification, shopfrontSyncHostsForTargets } from "./shopfront-sync-notification.ts";

test("targeted sync notifications only advance the selected Orithos host", () => {
  assert.deepEqual(shopfrontSyncHostsForTargets("skr", ["demo"]), ["demo.orithos.com.au"]);
  assert.deepEqual(shopfrontSyncHostsForTargets("skr"), ["skr.orithos.com.au", "demo.orithos.com.au"]);
  assert.throws(() => shopfrontSyncHostsForTargets("skr", ["other"]), /configured target/);
});

test("only completed syncs advance the freshness stamp while every status clears report caches", async () => {
  for (const status of ["completed", "partial", "failed"] as const) {
    const recorded: Array<[string, number]> = [];
    const cleared: string[] = [];

    await applyShopfrontSyncNotification({
      status,
      hosts: ["skr.orithos.com.au", "demo.orithos.com.au"],
      at: 1234,
      coverageRanges: [{ fromDay: "2026-11-19", toDay: "2026-11-20" }],
      latestThroughDay: "2026-11-20",
      record: async (host, at, coverageRanges, latestThroughDay) => {
        recorded.push([host, at, coverageRanges, latestThroughDay]);
      },
      clear: prefix => { cleared.push(prefix); },
    });

    assert.deepEqual(recorded, status === "completed"
      ? [["skr.orithos.com.au", 1234, [{ fromDay: "2026-11-19", toDay: "2026-11-20" }], "2026-11-20"],
        ["demo.orithos.com.au", 1234, [{ fromDay: "2026-11-19", toDay: "2026-11-20" }], "2026-11-20"]]
      : []);
    assert.deepEqual(cleared, ["skr.orithos.com.au|", "demo.orithos.com.au|"]);
  }
});
