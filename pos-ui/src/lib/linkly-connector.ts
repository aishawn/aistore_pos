export type ConnectorHealth = "reachable" | "offline" | "error";

export type ConnectorStatus = {
  linklyClient?: string;
  terminal?: string;
  detail?: string;
  tokenConfigured?: boolean;
  tokenRecoveryRequired?: boolean;
  adapterListener?: "reachable" | "unreachable" | "not-configured" | string;
  integrationMode?: "lab" | "adapter" | "tcp-proxy" | string;
};

export function isAdapterMode(status: ConnectorStatus | null | undefined): boolean {
  return status?.integrationMode === "adapter" || status?.integrationMode === "tcp-proxy";
}

export function isConnectorConfiguredAndReachable(status: ConnectorStatus | null | undefined): boolean {
  return status != null
    && isAdapterMode(status)
    && status.tokenConfigured === true
    && status.adapterListener === "reachable";
}

export type ConnectorLocalConfigPayload = {
  orithosApiUrl: string;
  connectorToken: string;
};

type LoopbackRequestInit = RequestInit & { targetAddressSpace?: "loopback" | "local" | "public" };

export type ConnectorPurchaseRequest = {
  attemptId: number;
  orderUuid: string;
  amountCents: number;
  currency: string;
  connectorChallenge: string;
};

export type ConnectorQueryRequest = {
  attemptId: number;
  orderUuid: string;
  connectorChallenge: string;
};

function normaliseBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function probeConnectorHealth(baseUrl: string): Promise<ConnectorHealth> {
  const target = `${normaliseBase(baseUrl)}/v1/health`;
  try {
    const response = await fetch(target, { method: "GET", cache: "no-store", mode: "cors" });
    if (!response.ok) return "error";
    return "reachable";
  } catch {
    return "offline";
  }
}

export async function fetchConnectorStatus(baseUrl: string): Promise<ConnectorStatus | null> {
  const target = `${normaliseBase(baseUrl)}/v1/status`;
  try {
    const response = await fetch(target, { method: "GET", cache: "no-store", mode: "cors" });
    if (!response.ok) return null;
    return (await response.json()) as ConnectorStatus;
  } catch {
    return null;
  }
}

export async function requestConnectorQuery(
  baseUrl: string,
  payload: ConnectorQueryRequest,
): Promise<void> {
  const target = `${normaliseBase(baseUrl)}/v1/query`;
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    mode: "cors",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Connector query failed (${response.status}).`);
  }
}

/** Push token and store API URL to Hardware Connect on this PC (no Windows env vars). */
export async function pushConnectorLocalConfig(
  baseUrl: string,
  payload: ConnectorLocalConfigPayload,
): Promise<void> {
  const target = `${normaliseBase(baseUrl)}/v1/config`;
  const init: LoopbackRequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    mode: "cors",
    targetAddressSpace: "loopback",
  };
  const response = await fetch(target, init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Could not apply connector settings (${response.status}). Update Hardware Connect to 1.1.1+.`);
  }
}

export async function requestConnectorPurchase(
  baseUrl: string,
  payload: ConnectorPurchaseRequest,
  onDispatchStarted?: () => void,
): Promise<void> {
  const target = `${normaliseBase(baseUrl)}/v1/purchase`;
  onDispatchStarted?.();
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    mode: "cors",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Connector rejected the purchase request (${response.status}).`);
  }
}
