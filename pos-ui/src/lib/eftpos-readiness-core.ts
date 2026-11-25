export type EftposReadinessSnapshot = {
  registerId: number | null;
  testPaymentRegisterId: number | null;
  enabled: boolean;
  paymentsEnabled: boolean;
  connectorHealth: "unknown" | "reachable" | "offline" | "error";
  connectorMode: "unknown" | "lab" | "tcp-proxy" | string;
  tokenConfigured: boolean;
  testPaymentAt: string;
  testPaymentStatus: "APPROVED" | "DECLINED" | "UNKNOWN" | "";
  updatedAt: string;
};

export function hasRecentApprovedEftposTest(
  snapshot: Pick<EftposReadinessSnapshot, "testPaymentRegisterId" | "testPaymentAt" | "testPaymentStatus">,
  registerId: number | null,
  now = Date.now(),
): boolean {
  const testedAt = Date.parse(snapshot.testPaymentAt);
  const age = now - testedAt;
  return snapshot.testPaymentRegisterId === registerId
    && registerId !== null
    && snapshot.testPaymentStatus === "APPROVED"
    && Number.isFinite(testedAt)
    && age >= 0
    && age < 24 * 60 * 60 * 1000;
}

export function hasFreshEftposDiagnostics(
  snapshot: Pick<EftposReadinessSnapshot, "updatedAt">,
  now = Date.now(),
  maxAgeMs = 60_000,
): boolean {
  const updatedAt = Date.parse(snapshot.updatedAt);
  const age = now - updatedAt;
  return Number.isFinite(updatedAt) && age >= 0 && age <= maxAgeMs;
}
