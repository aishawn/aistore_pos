"use client";

import { publishLocalHardwareSettingsChange } from "@/lib/local-hardware";

const KEY = "orithos.hardware.eftpos-readiness.v1";

export type EftposReadinessSnapshot = {
  registerId: number | null;
  enabled: boolean;
  paymentsEnabled: boolean;
  connectorHealth: "unknown" | "reachable" | "offline" | "error";
  connectorMode: "unknown" | "lab" | "tcp-proxy" | string;
  tokenConfigured: boolean;
  testPaymentAt: string;
  testPaymentStatus: "APPROVED" | "DECLINED" | "UNKNOWN" | "";
  updatedAt: string;
};

const EMPTY: EftposReadinessSnapshot = {
  registerId: null,
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

export function hasRecentApprovedEftposTest(snapshot: EftposReadinessSnapshot, registerId: number | null, now = Date.now()): boolean {
  const testedAt = Date.parse(snapshot.testPaymentAt);
  return snapshot.registerId === registerId
    && registerId !== null
    && snapshot.testPaymentStatus === "APPROVED"
    && Number.isFinite(testedAt)
    && now - testedAt < 24 * 60 * 60 * 1000;
}
