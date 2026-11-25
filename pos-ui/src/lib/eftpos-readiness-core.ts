export type EftposReadinessSnapshot = {
  registerId: number | null;
  testPaymentRegisterId: number | null;
  enabled: boolean;
  paymentsEnabled: boolean;
  connectorHealth: "unknown" | "reachable" | "offline" | "error";
  connectorMode: "unknown" | "lab" | "adapter" | "tcp-proxy" | string;
  tokenConfigured: boolean;
  testPaymentAt: string;
  testPaymentStatus: "APPROVED" | "DECLINED" | "UNKNOWN" | "";
  currentConfigurationKey: string;
  testConfigurationKey: string;
  updatedAt: string;
};

export function getEftposConfigurationKey(configuration: {
  registerId: number | null;
  connectorBaseUrl: string;
  terminalLabel: string;
  terminalModel: string;
  acquirer: string;
  enabled: boolean;
  paymentsEnabled: boolean;
}): string {
  let endpoint = "";
  try {
    const parsed = new URL(configuration.connectorBaseUrl);
    endpoint = `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port}`;
  } catch {
    endpoint = configuration.connectorBaseUrl.trim().toLowerCase();
  }
  const canonical = JSON.stringify([
    configuration.registerId,
    endpoint,
    configuration.terminalLabel.trim().toLowerCase(),
    configuration.terminalModel.trim().toLowerCase(),
    configuration.acquirer.trim().toLowerCase(),
    configuration.enabled,
    configuration.paymentsEnabled,
  ]);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function isAdapterMode(mode: string): boolean {
  return mode === "adapter" || mode === "tcp-proxy";
}

export function hasRecentApprovedEftposTest(
  snapshot: Pick<EftposReadinessSnapshot, "testPaymentRegisterId" | "testPaymentAt" | "testPaymentStatus" | "currentConfigurationKey" | "testConfigurationKey">,
  registerId: number | null,
  now = Date.now(),
  currentConfigurationKey = snapshot.currentConfigurationKey,
): boolean {
  const testedAt = Date.parse(snapshot.testPaymentAt);
  const age = now - testedAt;
  return snapshot.testPaymentRegisterId === registerId
    && registerId !== null
    && snapshot.testPaymentStatus === "APPROVED"
    && Boolean(currentConfigurationKey)
    && snapshot.testConfigurationKey === currentConfigurationKey
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
