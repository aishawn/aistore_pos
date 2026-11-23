"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, Zap } from "lucide-react";
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
  type ConnectorStatus,
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

function linklyModeLabel(status: ConnectorStatus | null): string | null {
  if (!status?.detail) return null;
  if (/lab mode/i.test(status.detail)) return "Test mode (no bank Linkly)";
  if (/Forwarding to Linkly/i.test(status.detail)) return "Bank Linkly";
  if (/waiting-for-token/i.test(status.linklyClient ?? "")) return "Waiting for store pairing";
  return null;
}

export function LinklyEftposPanel({ canEdit }: Props) {
  const [registers, setRegisters] = useState<RetailRegister[]>([]);
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [binding, setBinding] = useState<RegisterEftposBinding | null>(null);
  const [draft, setDraft] = useState<BindingDraft>(defaultDraft);
  const [lna, setLna] = useState<LocalNetworkAccessState>("unsupported");
  const [connectorHealth, setConnectorHealth] = useState<"unknown" | "reachable" | "offline" | "error">("unknown");
  const [connectorDetail, setConnectorDetail] = useState<ConnectorStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const loopbackReady = useHardwareLoopbackReady();
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const resolveStoreApiOrigin = useCallback(
    () => (typeof window !== "undefined" ? window.location.origin : "https://skr.orithos.com.au"),
    [],
  );

  useEffect(() => {
    function onFocus(event: Event) {
      const anchor = (event as CustomEvent<{ anchor: string }>).detail?.anchor;
      if (anchor !== "hardware-eftpos") return;
      const el = document.getElementById("hardware-eftpos");
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        setPanelOpen(true);
      }
    }
    window.addEventListener("hardware-setup-focus", onFocus);
    return () => window.removeEventListener("hardware-setup-focus", onFocus);
  }, []);

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

  const refreshDiagnostics = useCallback(
    async (baseUrl: string) => {
      const access = await resolveLocalNetworkAccessState();
      setLna(access);
      const health = await probeConnectorHealth(baseUrl);
      setConnectorHealth(health);
      let detail: ConnectorStatus | null = null;
      if (health === "reachable") {
        detail = await fetchConnectorStatus(baseUrl);
        setConnectorDetail(detail);
        if (detail?.linklyClient === "waiting-for-token" && revealedToken) {
          await applyConnectorToLocalPc(baseUrl, revealedToken);
          detail = await fetchConnectorStatus(baseUrl);
          setConnectorDetail(detail);
        }
      } else {
        setConnectorDetail(null);
      }
      saveEftposReadinessSnapshot({
        registerId: registerId ?? null,
        enabled: draft.enabled,
        paymentsEnabled: draft.paymentsEnabled,
        connectorHealth: health,
      });
      return { health, detail };
    },
    [applyConnectorToLocalPc, draft.enabled, draft.paymentsEnabled, registerId, revealedToken],
  );

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
        return undefined;
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load EFTPOS binding"))
      .finally(() => setLoadBusy(false));
  }, [registerId, refreshDiagnostics, loopbackReady, applyConnectorToLocalPc]);

  useEffect(() => {
    if (!panelOpen || !loopbackReady || binding?.paymentsEnabled) return;
    const baseUrl = draft.connectorBaseUrl || defaultDraft.connectorBaseUrl;
    const timer = window.setInterval(() => {
      void refreshDiagnostics(baseUrl);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [binding?.paymentsEnabled, draft.connectorBaseUrl, loopbackReady, panelOpen, refreshDiagnostics]);

  async function persistBinding(nextDraft: BindingDraft) {
    if (!canEdit || !registerId) return null;
    setActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await saveRegisterEftposBinding(registerId, {
        enabled: nextDraft.enabled,
        paymentsEnabled: nextDraft.paymentsEnabled,
        integrationMode: "local_connector",
        connectorBaseUrl: nextDraft.connectorBaseUrl.trim() || defaultDraft.connectorBaseUrl,
        terminalLabel: nextDraft.terminalLabel.trim(),
        terminalModel: nextDraft.terminalModel.trim(),
        acquirer: nextDraft.acquirer.trim(),
        rotateConnectorToken: nextDraft.rotateConnectorToken,
      });
      setBinding(saved);
      setDraft({ ...nextDraft, rotateConnectorToken: false });
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
            ? "Card payments are ready on this PC — try Test $1.00 on Sell or below."
            : "Saved on the server. Update Hardware Connect to 1.1.1+ to auto-apply the token.",
        );
        await refreshDiagnostics(baseUrl);
      } else if (!loopbackReady) {
        setNotice("Saved — allow browser access to this PC, then open this page again.");
      } else {
        setNotice("EFTPOS saved for this register.");
      }
      saveEftposReadinessSnapshot({
        registerId,
        enabled: saved.enabled,
        paymentsEnabled: saved.paymentsEnabled,
        connectorHealth,
      });
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
      return null;
    } finally {
      setActionBusy(false);
    }
  }

  async function connectCardPayments() {
    if (!canEdit || !registerId) return;
    setError(null);
    setNotice(null);
    const baseUrl = draft.connectorBaseUrl || defaultDraft.connectorBaseUrl;

    if (!loopbackReady) {
      setNotice("Allow local network access in the banner above, then try Connect again.");
      return;
    }

    setDiagBusy(true);
    let health: Awaited<ReturnType<typeof refreshDiagnostics>>["health"];
    try {
      ({ health } = await refreshDiagnostics(baseUrl));
    } finally {
      setDiagBusy(false);
    }

    if (health === "offline" || health === "error") {
      setNotice("Start Orithos Hardware Connect on this PC (tray icon), then press Connect card payments again.");
      window.dispatchEvent(new CustomEvent("hardware-setup-focus", { detail: { anchor: "hardware-connect" } }));
      return;
    }

    const nextDraft: BindingDraft = {
      ...draft,
      enabled: true,
      paymentsEnabled: true,
      rotateConnectorToken: !binding?.enabled || !revealedToken,
    };
    await persistBinding(nextDraft);
  }

  async function turnOffCardPayments() {
    if (!canEdit) return;
    await persistBinding({
      ...draft,
      enabled: draft.enabled,
      paymentsEnabled: false,
    });
    setNotice("Card payments turned off for Sell.");
  }

  async function refreshDiagnosticsClick() {
    if (!loopbackReady) {
      setNotice("Allow local network access first, then check status again.");
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
      setNotice(`Test payment ${finalAttempt.status}${finalAttempt.providerReference ? ` · ${finalAttempt.providerReference}` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test payment failed");
    } finally {
      setActionBusy(false);
    }
  }

  const busy = loadBusy || actionBusy || diagBusy;
  const paymentsLive = Boolean(binding?.paymentsEnabled && binding?.enabled);
  const browserOk = loopbackReady && lna === "granted";
  const agentOk = connectorHealth === "reachable";
  const modeHint = linklyModeLabel(connectorDetail);

  const statusLine = paymentsLive && agentOk
    ? `Ready on Sell${modeHint ? ` · ${modeHint}` : ""}`
    : paymentsLive
      ? "Enabled — waiting for Hardware Connect on this PC"
      : agentOk
        ? "Hardware Connect detected — connect this register"
        : loopbackReady
          ? "Install or start Hardware Connect on this PC"
          : "Allow browser access to this PC first";

  const stepClass = (ok: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] font-semibold ${ok ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`;

  return (
    <details
      id="hardware-eftpos"
      open={panelOpen}
      onToggle={(event) => setPanelOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 sm:px-5 sm:py-4"
    >
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span id="linkly-eftpos-title" className="text-base font-semibold text-[var(--oh-text)]">
              EFTPOS · Linkly
            </span>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              {paymentsLive && agentOk ? (
                <span className="font-medium text-emerald-800">{statusLine}</span>
              ) : (
                statusLine
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-[var(--oh-muted)]">{panelOpen ? "Collapse" : "Expand"}</span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-[var(--oh-border)] pt-4">
        <div className="flex flex-wrap gap-2">
          <span className={stepClass(browserOk)}>1 · Browser access</span>
          <span className={stepClass(agentOk)}>2 · Hardware Connect</span>
          <span className={stepClass(paymentsLive)}>3 · Register linked</span>
        </div>

        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}

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

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !paymentsLive ? (
            <button
              type="button"
              onClick={() => void connectCardPayments()}
              disabled={busy || !registerId}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Zap size={16} aria-hidden="true" />
              Connect card payments
            </button>
          ) : null}
          {paymentsLive ? (
            <button
              type="button"
              onClick={() => void runTestPayment()}
              disabled={loadBusy || actionBusy || !agentOk}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CreditCard size={16} aria-hidden="true" />
              Test $1.00
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !registerId}
            onClick={() => void refreshDiagnosticsClick()}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw size={15} className={diagBusy ? "animate-spin" : undefined} aria-hidden="true" />
            Check status
          </button>
        </div>

        <p className="text-xs leading-5 text-[var(--oh-muted)]">
          One tap pairs this register with the local bridge on port <span className="font-mono">9167</span>. Real bank terminals: install Linkly on this PC and set{" "}
          <span className="font-mono text-[11px]">ORITHOS_LINKLY_TCP_BASE</span> — otherwise test mode approves $1 automatically.
        </p>

        <details className="rounded-md border border-[var(--oh-border)] px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--oh-text)]">More · manual options</summary>
          <div className="mt-3 space-y-3 pb-1">
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  disabled={!canEdit}
                  aria-label="Enable EFTPOS for this register"
                  onChange={(e) => setDraft((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Enable EFTPOS for this register
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.paymentsEnabled}
                  disabled={!canEdit}
                  aria-label="Allow card payments on Sell"
                  onChange={(e) => setDraft((c) => ({ ...c, paymentsEnabled: e.target.checked }))}
                />
                Allow card payments on Sell
              </label>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void persistBinding(draft)}
                  className="inline-flex min-h-9 items-center rounded-md border border-[var(--oh-border)] px-3 text-xs font-semibold disabled:opacity-50"
                >
                  Save manual changes
                </button>
                {paymentsLive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void turnOffCardPayments()}
                    className="inline-flex min-h-9 items-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-900 disabled:opacity-50"
                  >
                    Turn off card payments
                  </button>
                ) : null}
              </div>
            ) : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Local network access", value: lna === "granted" ? "Granted" : "Needs allow", ok: browserOk },
                { label: "Local connector", value: agentOk ? "Running" : "Not reachable", ok: agentOk },
                {
                  label: "Linkly",
                  value: connectorDetail?.detail?.slice(0, 48) ?? "—",
                  ok: Boolean(connectorDetail?.tokenConfigured),
                },
                { label: "Sell", value: paymentsLive ? "On" : "Off", ok: paymentsLive },
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
                Terminal name
                <input value={draft.terminalLabel} onChange={(e) => setDraft((c) => ({ ...c, terminalLabel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Model
                <input value={draft.terminalModel} onChange={(e) => setDraft((c) => ({ ...c, terminalModel: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Acquirer
                <input value={draft.acquirer} onChange={(e) => setDraft((c) => ({ ...c, acquirer: e.target.value }))} readOnly={!canEdit} className="h-10 rounded-md border border-[var(--oh-border)] px-3" />
              </label>
            </div>
            {canEdit ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.rotateConnectorToken} onChange={(e) => setDraft((c) => ({ ...c, rotateConnectorToken: e.target.checked }))} />
                Rotate connector token on save
              </label>
            ) : null}
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
    </details>
  );
}