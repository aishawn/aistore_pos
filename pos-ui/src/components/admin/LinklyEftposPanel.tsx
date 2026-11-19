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
import { fetchConnectorStatus, probeConnectorHealth, requestConnectorPurchase } from "@/lib/linkly-connector";
import { resolveLocalNetworkAccessState, type LocalNetworkAccessState } from "@/lib/local-network-access";
import { useHardwareLoopbackReady } from "@/components/admin/hardware-loopback-context";

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
  }, []);

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
        setRevealedToken(readConnectorTokenHint(registerId));
        if (loopbackReady) {
          return refreshDiagnostics(next.connectorBaseUrl || defaultDraft.connectorBaseUrl);
        }
        setConnectorHealth("unknown");
        setConnectorStatus("Allow local network access, then refresh diagnostics.");
        return undefined;
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load EFTPOS binding"))
      .finally(() => setLoadBusy(false));
  }, [registerId, refreshDiagnostics, loopbackReady]);

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
      if (saved.revealedConnectorToken) {
        saveConnectorTokenForRegister(registerId, saved.revealedConnectorToken);
        setRevealedToken(saved.revealedConnectorToken);
        setNotice("Binding saved. Copy the connector token into the Orithos Linkly Connector on this PC.");
      } else {
        setNotice("EFTPOS binding saved for this register.");
      }
      if (loopbackReady) await refreshDiagnostics(saved.connectorBaseUrl);
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

  return (
    <section id="hardware-eftpos" className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5" aria-labelledby="linkly-eftpos-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
        <div>
          <h2 id="linkly-eftpos-title" className="text-base font-semibold text-[var(--oh-text)]">EFTPOS terminal pairing</h2>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">Register binding in Orithos · local Orithos Linkly Connector on this PC</p>
        </div>
        <button
          type="button"
          disabled={busy || !registerId}
          onClick={() => void refreshDiagnosticsClick()}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw size={15} className={diagBusy ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh diagnostics
        </button>
      </div>

      {connectorHealth === "offline" && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          No Linkly connector on this PC — expected on the EFTPOS register. Printer and scanner setup above still works; card tests need{" "}
          <span className="font-mono">tools/orithos-linkly-connector</span> tonight on the other machine.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
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
        <label className="grid gap-1 text-sm font-medium">
          Connector base URL
          <input
            value={draft.connectorBaseUrl}
            onChange={(event) => setDraft((current) => ({ ...current, connectorBaseUrl: event.target.value }))}
            readOnly={!canEdit}
            className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-mono text-xs"
          />
        </label>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {[
          { label: "Local network access", value: lnaLabel, ok: lna === "granted" },
          { label: "Orithos Connector", value: connectorLabel, ok: connectorHealth === "reachable" },
          { label: "Linkly Client", value: connectorStatus ?? "Not checked", ok: Boolean(connectorStatus && /ready|simulated/i.test(connectorStatus)) },
          { label: "Card payments", value: paymentsReady ? "Enabled for sell" : "Disabled", ok: paymentsReady },
        ].map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-2 rounded-md border border-[var(--oh-border)] px-3 py-2 text-sm">
            <span className="text-[var(--oh-muted)]">{row.label}</span>
            <span className={`font-medium ${row.ok ? "text-emerald-800" : "text-amber-900"}`}>{row.value}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          Terminal label
          <input value={draft.terminalLabel} onChange={(e) => setDraft((c) => ({ ...c, terminalLabel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Terminal model
          <input value={draft.terminalModel} onChange={(e) => setDraft((c) => ({ ...c, terminalModel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Acquirer
          <input value={draft.acquirer} onChange={(e) => setDraft((c) => ({ ...c, acquirer: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.enabled} disabled={!canEdit} onChange={(e) => setDraft((c) => ({ ...c, enabled: e.target.checked }))} />
          EFTPOS integration enabled
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.paymentsEnabled} disabled={!canEdit} onChange={(e) => setDraft((c) => ({ ...c, paymentsEnabled: e.target.checked }))} />
          Allow card payments on sell
        </label>
        {canEdit && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.rotateConnectorToken} onChange={(e) => setDraft((c) => ({ ...c, rotateConnectorToken: e.target.checked }))} />
            Rotate connector token on save
          </label>
        )}
      </div>

      {revealedToken && (
        <label className="mt-3 grid gap-1 text-sm font-medium">
          Connector token (set ORITHOS_CONNECTOR_TOKEN on this PC)
          <input readOnly value={revealedToken} className="h-10 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 font-mono text-xs" />
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && (
          <button type="button" onClick={() => void saveBinding()} disabled={loadBusy || actionBusy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">
            <Save size={15} aria-hidden="true" />
            Save EFTPOS binding
          </button>
        )}
        <button type="button" onClick={() => void runTestPayment()} disabled={loadBusy || actionBusy || !paymentsReady} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50">
          <CreditCard size={15} aria-hidden="true" />
          Test $1.00 (lab)
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--oh-muted)]">
        Run the Orithos Linkly Connector on this machine, enable API test mode, and turn on enforce-card-capture only when you are ready to block checkout without terminal approval.
      </p>
    </section>
  );
}