import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isTrustedSnapshotTimezone, readInventorySnapshotStatus } from "./inventory-snapshot-status.ts";

test("snapshot timezone requires a fresh, complete, continuous, valid scoped capture", () => {
  const trusted = {
    status: "FRESH" as const,
    businessTimezone: "Australia/Adelaide",
    expectedProducts: 10,
    capturedProducts: 10,
    productCoverage: 1,
    expectedWarehouses: 1,
    capturedWarehouses: 1,
    observedDays: 2,
    gapDays: 0,
    invalidSnapshots: 0,
    firstBusinessDate: "2026-10-31",
    latestBusinessDate: "2026-11-01",
  };
  assert.equal(isTrustedSnapshotTimezone(trusted), true);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, status: "REVIEW" }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, capturedProducts: 9 }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, capturedWarehouses: 0 }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, observedDays: 1 }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, observedDays: 3 }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, gapDays: 1 }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, latestBusinessDate: "2026-11-02" }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, latestBusinessDate: "2026-02-30" }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, businessTimezone: "not/a-timezone" }), false);
  assert.equal(isTrustedSnapshotTimezone({ ...trusted, businessTimezone: undefined }), false);
});

test("inventory status rejects cross-company data and exposes stale, failed and incomplete captures", async () => {
  const root = await mkdtemp(join(tmpdir(), "inventory-status-"));
  const oldRoot = process.env.INVENTORY_SNAPSHOT_ROOT;
  const oldDatabase = process.env.ODOO_DATABASE;
  process.env.INVENTORY_SNAPSHOT_ROOT = root;
  process.env.ODOO_DATABASE = "aipos_uat";
  try {
    await mkdir(join(root, "5"));
    const file = join(root, "5", "status.json");
    const value = { version: 1, companyId: 5, database: "aipos_uat", lastSuccessAt: new Date(Date.now() - 1000).toISOString(), lastAttemptStatus: "SUCCESS", productCoverage: 1, expectedWarehouses: 1, capturedWarehouses: 1, missingFields: { cost: 0 }, missingWarehouseQuantityFields: 0, gapDays: 0 };
    async function status(changes = {}) {
      await writeFile(file, JSON.stringify({ ...value, ...changes }));
      return readInventorySnapshotStatus(5);
    }
    assert.equal((await status()).status, "FRESH");
    assert.equal((await readInventorySnapshotStatus(127)).status, "UNAVAILABLE");
    assert.equal((await status({ companyId: 127 })).status, "UNAVAILABLE");
    assert.equal((await status({ database: "other" })).status, "UNAVAILABLE");
    assert.equal((await status({ lastSuccessAt: new Date(Date.now() - 37 * 3600_000).toISOString() })).status, "STALE");
    assert.equal((await status({ lastAttemptStatus: "FAILED" })).status, "REVIEW");
    assert.equal((await status({ missingFields: { leadTimeDays: 10 } })).status, "REVIEW");
    assert.equal((await status({ gapDays: 1 })).status, "REVIEW");
    assert.equal((await status({ lastSuccessAt: undefined, lastAttemptStatus: "FAILED" })).status, "UNAVAILABLE");
  } finally {
    if (oldRoot === undefined) delete process.env.INVENTORY_SNAPSHOT_ROOT; else process.env.INVENTORY_SNAPSHOT_ROOT = oldRoot;
    if (oldDatabase === undefined) delete process.env.ODOO_DATABASE; else process.env.ODOO_DATABASE = oldDatabase;
    await rm(root, { recursive: true, force: true });
  }
});
