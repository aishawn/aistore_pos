"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, Save } from "lucide-react";
import { listRetailRegisters, type RetailRegister } from "@/lib/api";
import {
  createEftposAttempt,
  getEftposAttemptByOrder,
  getRegisterEftposBinding,
  readConnectorTokenHint,
  readPreferredEftposRegisterId,
  saveConnectorTokenForRegister,
  savePreferredEftposRegisterId,
  saveRegisterEftposBinding,
  type RegisterEftposBinding,
} from "@/lib/eftpos-api";
import {
  fetchConnectorStatus,
  probeConnectorHealth,
  pushConnectorLocalConfig,
  requestConnectorPurchase,
} from "@/lib/linkly-connector";
import { resolveLocalNetworkAccessState, type LocalNetworkAccessState } from "@/lib/local-network-access";
import { useHardwareLoopbackReady } from "@/components/admin/hardware-loopback-context";
import { saveEftposReadinessSnapshot } from "@/lib/hardware-eftpos-readiness";

type Props = {
  canEdit: boolean;
};

type BindingDraft = {
  enabled: boolean;
  paymentsEnabled: boolean;
  connectorBaseUrl: string;
  terminalLabel: string;
  terminalModel: string;
  acquirer: string;
  rotateConnectorToken: boolean;
};

const defaultDraft: BindingDraft = {
  enabled: false,
  paymentsEnabled: false,
  connectorBaseUrl: "http://127.0.0.1:9167",
  terminalLabel: "",
  terminalModel: "",
  acquirer: "",
  rotateConnectorToken: false,
};

export function LinklyEftposPanel({ canEdit }: Props) {
  const [registers, setRegisters] = useState<RetailRegister[]>([]);
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [binding, setBinding] = useState<RegisterEftposBinding | null>(null);
  const [draft, setDraft] = useState<BindingDraft>(defaultDraft);
  const [lna, setLna] = useState<LocalNetworkAccessState>("unsupported");
  const [connectorHealth, setConnectorHealth] = useState<"unknown" | "reachable" | "offline" | "error">("unknown");
  const [connectorStatus, setConnectorStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const loopbackReady = useHardwareLoopbackReady();
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const resolveStoreApiOrigin = useCallback(
    () => (typeof window !== "undefined" ? window.location.origin : "https://skr.orithos.com.au"),
    [],
  );

  const applyConnectorToLocalPc = useCallback(
    async (baseUrl: string, token: string | null | undefined) => {
      const trimmed = token?.trim();
      if (!trimmed || !loopbackReady) return false;
      try {
        await pushConnectorLocalConfig(baseUrl, {
          connectorToken: trimmed,
          orithosApiUrl: resolveStoreApiOrigin(),
        });
        return true;
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "Could not sync token to this PC.");
        return false;
      }
    },
    [loopbackReady, resolveStoreApiOrigin],
  );

  const refreshDiagnostics = useCallback(async (baseUrl: string) => {
    const access = await resolveLocalNetworkAccessState();
    setLna(access);
    const health = await probeConnectorHealth(baseUrl);
    setConnectorHealth(health);
    if (health === "reachable") {
      const status = await fetchConnectorStatus(baseUrl);
      if (status?.linklyClient && status?.terminal) {
        setConnectorStatus(`${status.linklyClient} · terminal ${status.terminal}`);
      } else if (status?.detail) {
        setConnectorStatus(status.detail);
      } else {
        setConnectorStatus(status ? "Connector responded" : "Connector status unavailable");
      }
    } else {
      setConnectorStatus(null);
    }
    saveEftposReadinessSnapshot({
      registerId: registerId ?? null,
      enabled: draft.enabled,
      paymentsEnabled: draft.paymentsEnabled,
      connectorHealth: health,
    });
  }, [draft.enabled, draft.paymentsEnabled, registerId]);

  useEffect(() => {
    void listRetailRegisters()
      .then((items) => {
        setRegisters(items);
        const preferred = readPreferredEftposRegisterId();
        const initial = preferred && items.some((item) => item.id === preferred)
          ? preferred
          : items[0]?.id ?? null;
        setRegisterId(initial);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not list registers"));
  }, []);

  useEffect(() => {
    if (!registerId) return;
    savePreferredEftposRegisterId(registerId);
    setLoadBusy(true);
    void getRegisterEftposBinding(registerId)
      .then((next) => {
        setBinding(next);
        setDraft({
          enabled: next.enabled,
          paymentsEnabled: next.paymentsEnabled,
          connectorBaseUrl: next.connectorBaseUrl || defaultDraft.connectorBaseUrl,
          terminalLabel: next.terminalLabel ?? "",
          terminalModel: next.terminalModel ?? "",
          acquirer: next.acquirer ?? "",
          rotateConnectorToken: false,
        });
        const hinted = readConnectorTokenHint(registerId);
        setRevealedToken(hinted);
        const baseUrl = next.connectorBaseUrl || defaultDraft.connectorBaseUrl;
        if (loopbackReady) {
          if (hinted) {
            void applyConnectorToLocalPc(baseUrl, hinted).then(() => refreshDiagnostics(baseUrl));
          } else {
            return refreshDiagnostics(baseUrl);
          }
        }
        setConnectorHealth("unknown");
        setConnectorStatus("Allow local network access, then refresh diagnostics.");
        return undefined;
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load EFTPOS binding"))
      .finally(() => setLoadBusy(false));
  }, [registerId, refreshDiagnostics, loopbackReady, applyConnectorToLocalPc]);

  async function saveBinding() {
    if (!canEdit || !registerId) return;
    setActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const mode = draft.paymentsEnabled ? "local_connector" : "local_connector";
      const saved = await saveRegisterEftposBinding(registerId, {
        enabled: draft.enabled,
        paymentsEnabled: draft.paymentsEnabled,
        integrationMode: mode,
        connectorBaseUrl: draft.connectorBaseUrl.trim() || defaultDraft.connectorBaseUrl,
        terminalLabel: draft.terminalLabel.trim(),
        terminalModel: draft.terminalModel.trim(),
        acquirer: draft.acquirer.trim(),
        rotateConnectorToken: draft.rotateConnectorToken,
      });
      setBinding(saved);
      let token = saved.revealedConnectorToken;
      if (token) {
        saveConnectorTokenForRegister(registerId, token);
        setRevealedToken(token);
      } else {
        token = readConnectorTokenHint(registerId);
      }
      const baseUrl = saved.connectorBaseUrl || defaultDraft.connectorBaseUrl;
      if (loopbackReady && token) {
        const synced = await applyConnectorToLocalPc(baseUrl, token);
        setNotice(
          synced
            ? "Saved. Connector token applied on this PC — try Test $1.00."
            : "Saved on the server. Update Hardware Connect to 1.1.1+ to auto-apply the token.",
        );
        await refreshDiagnostics(baseUrl);
      } else {
        setNotice("EFTPOS saved for this register.");
      }
      saveEftposReadinessSnapshot({
        registerId,
        enabled: saved.enabled,
        paymentsEnabled: saved.paymentsEnabled,
        connectorHealth,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function refreshDiagnosticsClick() {
    if (!loopbackReady) {
      setNotice("Allow local network access first, then refresh diagnostics.");
      return;
    }
    setDiagBusy(true);
    try {
      await refreshDiagnostics(draft.connectorBaseUrl || defaultDraft.connectorBaseUrl);
    } finally {
      setDiagBusy(false);
    }
  }

  async function runTestPayment() {
    if (!registerId || !binding?.paymentsEnabled) return;
    setActionBusy(true);
    setError(null);
    setNotice(null);
    const orderUuid = crypto.randomUUID();
    try {
      const attempt = await createEftposAttempt(registerId, {
        orderUuid,
        expectedTotal: 1,
        quoteSignature: null,
      });
      await requestConnectorPurchase(attempt.connectorBaseUrl, {
        attemptId: attempt.attemptId,
        orderUuid: attempt.orderUuid,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        connectorChallenge: attempt.connectorChallenge,
      });
      let finalAttempt = attempt;
      for (let i = 0; i < 20; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        finalAttempt = await getEftposAttemptByOrder(registerId, orderUuid);
        if (finalAttempt.status === "APPROVED" || finalAttempt.status === "DECLINED" || finalAttempt.status === "CANCELLED") break;
      }
      setNotice(`Test payment ${finalAttempt.status} · ref ${finalAttempt.providerReference ?? "n/a"}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test payment failed");
    } finally {
      setActionBusy(false);
    }
  }

  const busy = loadBusy || actionBusy || diagBusy;
  const paymentsReady = Boolean(binding?.paymentsEnabled);
  const lnaLabel = lna === "granted" ? "Granted" : lna === "denied" ? "Denied" : lna === "prompt" ? "Needs prompt" : "Check browser";
  const connectorLabel = connectorHealth === "reachable" ? "Running" : connectorHealth === "offline" ? "Not reachable" : connectorHealth === "error" ? "Error" : "Unknown";

  const connectorSummary =
    connectorHealth === "reachable"
      ? "Connector running on this PC"
      : connectorHealth === "offline"
        ? "Connector not detected on this PC"
        : "Connector status unknown";

  const statusLine = paymentsReady
    ? "Enabled on Sell"
    : draft.enabled
      ? "Enabled, card payments off"
      : connectorSummary;

  return (
    <details
      id="hardware-eftpos"
      className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 sm:px-5 sm:py-4"
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span id="linkly-eftpos-title" className="text-base font-semibold text-[var(--oh-text)]">
              EFTPOS integration · Linkly
            </span>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              {paymentsReady ? (
                <span className="font-medium text-emerald-800">{statusLine}</span>
              ) : (
                statusLine
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-[var(--oh-muted)]">Expand</span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-[var(--oh-border)] pt-4">
        <div className="flex flex-wrap justify-end gap-2">
          {canEdit && (
            <button type="button" onClick={() => void saveBinding()} disabled={loadBusy || actionBusy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">
              <Save size={15} aria-hidden="true" />
              Save
            </button>
          )}
        </div>

        {connectorHealth === "offline" && !draft.paymentsEnabled && (
          <p className="text-xs text-[var(--oh-muted)]">
            Run Hardware Connect on this PC, then enable EFTPOS below and Save — the token syncs automatically (v1.1.1+). For a bank Linkly client, set Windows env{" "}
            <span className="font-mono text-[11px]">ORITHOS_LINKLY_TCP_BASE</span> to its local URL; otherwise lab mode auto-approves test payments. For a bank Linkly client, set Windows env{" "}
            <span className="font-mono text-[11px]">ORITHOS_LINKLY_TCP_BASE</span> to its local URL; otherwise lab mode auto-approves test payments.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

        <div className="space-y-4">
        <label className="grid max-w-md gap-1 text-sm font-medium">
          Cash register
          <select
            value={registerId ?? ""}
            onChange={(event) => setRegisterId(Number(event.target.value) || null)}
            className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3"
          >
            {registers.map((item) => (
              <option key={item.id} value={item.id}>{item.name || `Register ${item.id}`}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.enabled} disabled={!canEdit} onChange={(e) => setDraft((c) => ({ ...c, enabled: e.target.checked }))} />
            Enable EFTPOS for this register
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.paymentsEnabled} disabled={!canEdit} onChange={(e) => setDraft((c) => ({ ...c, paymentsEnabled: e.target.checked }))} />
            Allow card payments on Sell
          </label>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--oh-border)] pt-4">
          <button type="button" onClick={() => void runTestPayment()} disabled={loadBusy || actionBusy || !paymentsReady} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50">
            <CreditCard size={15} aria-hidden="true" />
            Test $1.00
          </button>
        </div>

        <details className="rounded-md border border-[var(--oh-border)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--oh-text)]">More · Linkly client, terminal model and diagnostics</summary>
          <div className="mt-3 space-y-3 pb-1">
            <div className="flex flex-wrap justify-end">
              <button
                type="button"
                disabled={busy || !registerId}
                onClick={() => void refreshDiagnosticsClick()}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-xs font-semibold disabled:opacity-50"
              >
                <RefreshCw size={14} className={diagBusy ? "animate-spin" : undefined} aria-hidden="true" />
                Refresh diagnostics
              </button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Local network access", value: lnaLabel, ok: lna === "granted" },
                { label: "Orithos local connector", value: connectorLabel, ok: connectorHealth === "reachable" },
                { label: "Linkly client", value: connectorStatus ?? "Not checked", ok: Boolean(connectorStatus && /ready|simulated/i.test(connectorStatus)) },
                { label: "Card payments", value: paymentsReady ? "Enabled" : "Disabled", ok: paymentsReady },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-xs">
                  <span className="text-[var(--oh-muted)]">{row.label}</span>
                  <span className={`font-medium ${row.ok ? "text-emerald-800" : "text-amber-900"}`}>{row.value}</span>
                </li>
              ))}
            </ul>
            <label className="grid gap-1 text-sm font-medium">
              Connector URL
              <input
                value={draft.connectorBaseUrl}
                onChange={(event) => setDraft((current) => ({ ...current, connectorBaseUrl: event.target.value }))}
                readOnly={!canEdit}
                className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-mono text-xs"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-medium">
                EFTPOS terminal name
                <input value={draft.terminalLabel} onChange={(e) => setDraft((c) => ({ ...c, terminalLabel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                EFTPOS terminal model
                <input value={draft.terminalModel} onChange={(e) => setDraft((c) => ({ ...c, terminalModel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Acquirer
                <input value={draft.acquirer} onChange={(e) => setDraft((c) => ({ ...c, acquirer: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
            </div>
            {canEdit && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.rotateConnectorToken} onChange={(e) => setDraft((c) => ({ ...c, rotateConnectorToken: e.target.checked }))} />
                Rotate connector token on save
              </label>
            )}
            {canEdit && revealedToken ? (
              <button
                type="button"
                className="inline-flex min-h-9 items-center rounded-md border border-[var(--oh-border)] px-3 text-xs font-semibold"
                onClick={() => {
                  const base = draft.connectorBaseUrl || defaultDraft.connectorBaseUrl;
                  void applyConnectorToLocalPc(base, revealedToken).then((ok) => {
                    if (ok) {
                      setNotice("Token re-applied on this PC.");
                      void refreshDiagnostics(base);
                    }
                  });
                }}
              >
                Re-apply token on this PC
              </button>
            ) : null}
          </div>
        </details>
        </div>
      </div>
    </details>
  );
}
