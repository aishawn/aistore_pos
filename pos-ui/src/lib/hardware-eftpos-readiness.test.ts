import assert from "node:assert/strict";
import test from "node:test";
import {
  getEftposConfigurationKey,
  hasFreshEftposDiagnostics,
  hasRecentApprovedEftposTest,
  type EftposReadinessSnapshot,
} from "./hardware-eftpos-readiness.ts";

const now = Date.parse("2026-11-25T00:00:00.000Z");
const snapshot: EftposReadinessSnapshot = {
  registerId: 7,
  testPaymentRegisterId: 7,
  enabled: true,
  paymentsEnabled: true,
  connectorHealth: "reachable",
  connectorMode: "tcp-proxy",
  tokenConfigured: true,
  testPaymentAt: new Date(now - 60_000).toISOString(),
  testPaymentStatus: "APPROVED",
  currentConfigurationKey: "cfg-a",
  testConfigurationKey: "cfg-a",
  updatedAt: new Date(now).toISOString(),
};

test("recent approved terminal test completes readiness only for its register", () => {
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now), true);
  assert.equal(hasRecentApprovedEftposTest(snapshot, 8, now), false);
});

test("approved terminal test becomes stale when adapter or terminal configuration changes", () => {
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now, "cfg-a"), true);
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now, "cfg-b"), false);
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testConfigurationKey: "" }, 7, now, "cfg-a"), false);
});

test("configuration keys track operational changes without retaining connector URL details", () => {
  const base = {
    registerId: 7,
    connectorBaseUrl: "http://127.0.0.1:9167/path?token=not-persisted",
    terminalLabel: "Front counter",
    terminalModel: "Ingenico",
    acquirer: "Bank A",
    enabled: true,
    paymentsEnabled: true,
  };
  const key = getEftposConfigurationKey(base);
  assert.equal(key, getEftposConfigurationKey({ ...base, connectorBaseUrl: "http://127.0.0.1:9167/other" }));
  assert.notEqual(key, getEftposConfigurationKey({ ...base, terminalModel: "Different terminal" }));
  assert.notEqual(key, getEftposConfigurationKey({ ...base, acquirer: "Bank B" }));
  assert.equal(key.includes("token"), false);
  assert.equal(key.includes("9167"), false);
});

test("declined, unknown, invalid, and expired tests do not complete readiness", () => {
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentStatus: "UNKNOWN" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentStatus: "DECLINED" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest({ ...snapshot, testPaymentAt: "invalid" }, 7, now), false);
  assert.equal(hasRecentApprovedEftposTest(snapshot, 7, now + 24 * 60 * 60 * 1000), false);
  assert.equal(
    hasRecentApprovedEftposTest({ ...snapshot, testPaymentAt: new Date(now + 60_000).toISOString() }, 7, now),
    false,
  );
});

test("stale or future connector diagnostics cannot claim current readiness", () => {
  assert.equal(hasFreshEftposDiagnostics(snapshot, now), true);
  assert.equal(hasFreshEftposDiagnostics({ updatedAt: new Date(now - 61_000).toISOString() }, now), false);
  assert.equal(hasFreshEftposDiagnostics({ updatedAt: new Date(now + 1_000).toISOString() }, now), false);
});
