"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import {
  closeOdooPosSession,
  getOdooPosBootstrap,
  getOdooSession,
  type OdooPosBootstrap,
} from "@/lib/odoo-api";

export function OdooCloseRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [connected, setConnected] = useState(false);
  const [configId, setConfigId] = useState<number | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sessionName: string; registerName: string; state: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getOdooSession();
      setConnected(Boolean(user));
      if (!user) {
        setBootstrap(null);
        return;
      }
      const data = await getOdooPosBootstrap();
      setBootstrap(data);
      const open = data.configs.find((item) => item.session) ?? data.configs[0];
      setConfigId((current) => current && data.configs.some((item) => item.id === current) ? current : open?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Odoo registers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = bootstrap?.configs.find((item) => item.id === configId) ?? null;
  const requiresCashCount = Boolean(selected?.paymentMethods.some((method) => method.is_cash_count));

  async function handleClose() {
    if (!selected?.session || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const cash = countedCash.trim() ? Number(countedCash) : null;
      if (requiresCashCount && cash == null) {
        throw new Error("Count the cash in the drawer before closing this register.");
      }
      if (cash != null && (!Number.isFinite(cash) || cash < 0 || cash > 1_000_000)) {
        throw new Error("Enter a valid counted cash amount, or leave it blank.");
      }
      const closed = await closeOdooPosSession(selected.id, cash);
      setResult({
        sessionName: closed.sessionName,
        registerName: closed.registerName,
        state: closed.state,
        message: closed.message,
      });
      setConfirming(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not close the register.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-muted)]" /></main>;
  }

  if (!connected) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <CircleAlert className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to close a register</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Closing a register ends the open Odoo POS session for that terminal.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Close register</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">End the open Odoo POS session after reconciling cash.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-paper)]">
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{error}</div>}
      {result && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold inline-flex items-center gap-2"><Check size={16} /> {result.registerName} · {result.sessionName}</p>
          <p className="mt-1">{result.message}</p>
          <p className="mt-1 text-xs">Odoo session state: <strong>{result.state}</strong></p>
        </div>
      )}

      <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
        <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
          Register
          <select
            value={configId ?? ""}
            onChange={(event) => {
              setConfigId(Number(event.target.value));
              setCountedCash("");
            }}
            className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal"
          >
            {bootstrap?.configs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}{config.session ? ` · ${config.session.name}` : " · No open session"}
              </option>
            ))}
          </select>
        </label>

        {selected?.session ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
            <dt className="text-[var(--oh-muted)]">Open session</dt>
            <dd className="text-right font-medium text-[var(--oh-text)]">{selected.session.name}</dd>
            <dt className="text-[var(--oh-muted)]">Started</dt>
            <dd className="text-right text-[var(--oh-text-secondary)]">
              {selected.session.start_at
                ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(new Date(`${String(selected.session.start_at).replace(" ", "T")}Z`))
                : "—"}
            </dd>
          </dl>
        ) : (
          <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />This register has no open session. Open one in Odoo before closing.</span>
            <a href="https://odoo.orithos.com.au/odoo/point-of-sale" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Odoo POS</a>
          </div>
        )}

        <label className="mt-4 grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
          Counted cash {requiresCashCount ? "(required)" : "(optional)"}
          <input
            type="number"
            min="0"
            step="0.05"
            required={requiresCashCount}
            value={countedCash}
            onChange={(event) => setCountedCash(event.target.value)}
            placeholder={requiresCashCount ? "Enter the amount counted in the drawer (AUD)" : "Leave blank to skip cash count write-back"}
            className="h-11 rounded-md border border-[var(--oh-border)] px-3 text-sm font-normal tabular-nums"
          />
          <span className="text-xs font-normal text-[var(--oh-muted)]">
            {requiresCashCount
              ? "Required for this cash-enabled register. The counted amount is written to Odoo when you confirm."
              : "This register has no cash payment method, so a cash count is optional."}
          </span>
        </label>

        <p className="mt-3 text-xs leading-5 text-[var(--oh-muted)]">
          Closing sends Odoo&apos;s session closing control. If cash differences remain, finish reconciliation in Odoo.
          Parked sales on this browser are local drafts and are not uploaded by close.
        </p>

        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!selected?.session || busy || (requiresCashCount && !countedCash.trim())}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
          {busy ? "Closing…" : "Close register in Odoo"}
        </button>
      </section>

      {confirming && selected?.session && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="close-register-title"
            aria-describedby="close-register-description"
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl"
          >
            <h2 id="close-register-title" className="text-lg font-semibold text-[var(--oh-text)]">Close this Odoo session?</h2>
            <p id="close-register-description" className="mt-2 text-sm leading-6 text-[var(--oh-text-secondary)]">
              This will send the closing request for <strong>{selected.name}</strong> · <strong>{selected.session.name}</strong>.
              Check the cash count and make sure all sales are reconciled before continuing.
            </p>
            {countedCash.trim() && (
              <p className="mt-3 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">
                Cash count to record: <strong>{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(countedCash) || 0)}</strong>
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="h-10 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"
              >
                Keep session open
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-50"
              >
                {busy && <LoaderCircle size={16} className="animate-spin" />}
                {busy ? "Closing…" : "Confirm close"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
