import { api } from "./api";

export type RegisterEftposBinding = {
  registerId: number;
  enabled: boolean;
  paymentsEnabled: boolean;
  integrationMode: string;
  connectorBaseUrl: string;
  terminalLabel: string | null;
  terminalModel: string | null;
  acquirer: string | null;
  hasConnectorToken: boolean;
  revealedConnectorToken: string | null;
};

export type EftposAttempt = {
  attemptId: number;
  orderUuid: string;
  amountCents: number;
  currency: string;
  status: string;
  providerReference: string | null;
  connectorChallenge: string;
  connectorBaseUrl: string;
  paymentsEnabled: boolean;
};

export type EftposDispatchClaim = {
  attempt: EftposAttempt;
  dispatchAuthorized: boolean;
};

export type UpsertRegisterEftposBindingPayload = {
  enabled: boolean;
  paymentsEnabled: boolean;
  integrationMode: string;
  connectorBaseUrl: string;
  terminalLabel: string;
  terminalModel: string;
  acquirer: string;
  rotateConnectorToken: boolean;
};

export type CreateEftposAttemptPayload = {
  orderUuid: string;
  expectedTotal: number;
  quoteSignature: string | null;
};

const REGISTER_KEY = "orithos.eftpos.register-id.v1";

export function readPreferredEftposRegisterId(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(REGISTER_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function savePreferredEftposRegisterId(registerId: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(REGISTER_KEY, String(registerId));
}

const TOKEN_KEY_PREFIX = "orithos.eftpos.connector-token.v1.";

export function saveConnectorTokenForRegister(registerId: number, token: string) {
  if (typeof localStorage === "undefined" || !token.trim()) return;
  localStorage.setItem(`${TOKEN_KEY_PREFIX}${registerId}`, token.trim());
}

export function readConnectorTokenHint(registerId: number): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(`${TOKEN_KEY_PREFIX}${registerId}`);
}

export function getRegisterEftposBinding(registerId: number): Promise<RegisterEftposBinding> {
  return api.get<RegisterEftposBinding>(`/api/retail/registers/${registerId}/eftpos/binding`);
}

export function saveRegisterEftposBinding(
  registerId: number,
  payload: UpsertRegisterEftposBindingPayload,
): Promise<RegisterEftposBinding> {
  return api.put<RegisterEftposBinding>(`/api/retail/registers/${registerId}/eftpos/binding`, payload);
}

export function createEftposAttempt(
  registerId: number,
  payload: CreateEftposAttemptPayload,
): Promise<EftposAttempt> {
  return api.post<EftposAttempt>(`/api/retail/registers/${registerId}/eftpos/attempts`, payload);
}

export function getEftposAttemptByOrder(
  registerId: number,
  orderUuid: string,
): Promise<EftposAttempt> {
  return api.get<EftposAttempt>(`/api/retail/registers/${registerId}/eftpos/attempts/by-order/${encodeURIComponent(orderUuid)}`);
}

export function claimEftposAttemptDispatch(registerId: number, attemptId: number): Promise<EftposDispatchClaim> {
  return api.post<EftposDispatchClaim>(
    `/api/retail/registers/${registerId}/eftpos/attempts/${attemptId}/dispatch`,
    {},
  );
}

export function simulateEftposApproval(registerId: number, attemptId: number): Promise<EftposAttempt> {
  return api.post<EftposAttempt>(
    `/api/retail/registers/${registerId}/eftpos/attempts/${attemptId}/simulate-approval`,
    {},
  );
}

export function cancelActiveEftposAttempt(registerId: number): Promise<EftposAttempt> {
  return api.post<EftposAttempt>(`/api/retail/registers/${registerId}/eftpos/attempts/cancel-active`, {});
}
