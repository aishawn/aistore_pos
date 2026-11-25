"use client";

import { publishLocalHardwareSettingsChange } from "@/lib/local-hardware";
import type { EftposReadinessSnapshot } from "@/lib/eftpos-readiness-core";
export { hasFreshEftposDiagnostics, hasRecentApprovedEftposTest } from "@/lib/eftpos-readiness-core";
export type { EftposReadinessSnapshot } from "@/lib/eftpos-readiness-core";

const KEY = "orithos.hardware.eftpos-readiness.v1";

const EMPTY: EftposReadinessSnapshot = {
  registerId: null,
  testPaymentRegisterId: null,
  enabled: false,
  paymentsEnabled: false,
  connectorHealth: "unknown",
  connectorMode: "unknown",
  tokenConfigured: false,
  testPaymentAt: "",
  testPaymentStatus: "",
  updatedAt: "",
};

export function saveEftposReadinessSnapshot(snapshot: Omit<EftposReadinessSnapshot, "updatedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: EftposReadinessSnapshot = { ...snapshot, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
    publishLocalHardwareSettingsChange();
  } catch {
    /* ignore */
  }
}

export function readEftposReadinessSnapshot(): EftposReadinessSnapshot {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const value = JSON.parse(raw) as Partial<EftposReadinessSnapshot>;
    return {
      registerId: typeof value.registerId === "number" ? value.registerId : null,
      testPaymentRegisterId: typeof value.testPaymentRegisterId === "number" ? value.testPaymentRegisterId : null,
      enabled: value.enabled === true,
      paymentsEnabled: value.paymentsEnabled === true,
      connectorHealth:
        value.connectorHealth === "reachable"
        || value.connectorHealth === "offline"
        || value.connectorHealth === "error"
          ? value.connectorHealth
          : "unknown",
      connectorMode: typeof value.connectorMode === "string" ? value.connectorMode : "unknown",
      tokenConfigured: value.tokenConfigured === true,
      testPaymentAt: typeof value.testPaymentAt === "string" ? value.testPaymentAt : "",
      testPaymentStatus: value.testPaymentStatus === "APPROVED" || value.testPaymentStatus === "DECLINED" || value.testPaymentStatus === "UNKNOWN" ? value.testPaymentStatus : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function getEftposReadinessSnapshotJson(): string {
  return JSON.stringify(readEftposReadinessSnapshot());
}
