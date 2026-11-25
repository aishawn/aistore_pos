import assert from "node:assert/strict";
import test from "node:test";
import { hasRecentApprovedEftposTest, type EftposReadinessSnapshot } from "./hardware-eftpos-readiness.ts";

const now = Date.parse("2026-11-25T00:00:00.000Z");
const snapshot: EftposReadinessSnapshot = {
  registerId: 7,
  enabled: true,
  paymentsEnabled: true,
  connectorHealth: "reachable",
  connectorMode: "tcp-proxy",
  tokenConfigured: true,
  testPaymentAt: new Date(now - 60_000).toISOString(),
  testPaymentStatus: "APPROVED",
  updatedAt: new Date(now).toISOString(),
};

test("recent approved terminal test completes readiness only for its register", () => {
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now), true);
  assert.equal(hasRecentApprovedEftposTest(snapshot, 8, now), false);
});

test("declined, unknown, invalid, and expired tests do not complete readiness", () => {
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentStatus: "UNKNOWN" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentStatus: "DECLINED" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentAt: "invalid" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now + 24 * 60 * 60 * 1000), false);
});
