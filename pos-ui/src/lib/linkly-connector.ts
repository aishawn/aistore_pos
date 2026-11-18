export type ConnectorHealth = "reachable" | "offline" | "error";

export type ConnectorStatus = {
  linklyClient?: string;
  terminal?: string;
  detail?: string;
};

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

export async function requestConnectorPurchase(
  baseUrl: string,
  payload: ConnectorPurchaseRequest,
): Promise<void> {
  const target = `${normaliseBase(baseUrl)}/v1/purchase`;
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