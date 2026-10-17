"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import {
  closeOdooPosSession,
  getOdooPosBootstrap,
  getOdooSession,
  type OdooPosBootstrap,
} from "@/lib/odoo-api";
import { formatOdooDateTime } from "@/lib/odoo-date";

const REGISTER_SELECTION_KEY = "orithos-odoo-register-v1";
const CASH_DENOMINATIONS = [
  { value: 0.05, label: "$0.05" },
  { value: 0.1, label: "$0.10" },
  { value: 0.2, label: "$0.20" },
  { value: 0.5, label: "$0.50" },
  { value: 1, label: "$1" },
  { value: 2, label: "$2" },
  { value: 5, label: "$5" },
  { value: 10, label: "$10" },
  { value: 20, label: "$20" },
  { value: 50, label: "$50" },
  { value: 100, label: "$100" },
] as const;

export function OdooCloseRegisterPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [cashCounts, setCashCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [result, setResult] = useState<{ sessionName: string; registerName: string; state: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getOdooSession();
      setConnected(Boolean(user));
      setOdooUserId(user?.id ?? null);
      if (!user) {
        setBootstrap(null);
        return;
      }
      const data = await getOdooPosBootstrap();
      setBootstrap(data);
      setLastLoadedAt(Date.now());
      let rememberedId: number | null = null;
      try {
        const stored = Number(localStorage.getItem(`${REGISTER_SELECTION_KEY}:${user.id}`));
        if (Number.isSafeInteger(stored) && stored > 0) rememberedId = stored;
      } catch { /* Keep the default register when storage is unavailable. */ }
      const open = data.configs.find((item) => item.id === rememberedId)
        ?? data.configs.find((item) => item.session)
        ?? data.configs[0];
      setConfigId(open?.id ?? null);
      if (open) {
        try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${user.id}`, String(open.id)); } catch { /* Keep the current selection for this session. */ }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Odoo registers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = bootstrap?.configs.find((item) => item.id === configId) ?? null;
  const requiresCashCount = Boolean(selected?.paymentMethods.some((method) => method.is_cash_count));
  const denominationTotal = useMemo(
    () => CASH_DENOMINATIONS.reduce((total, denomination) => total + denomination.value * (Number(cashCounts[String(denomination.value)]) || 0), 0),
    [cashCounts],
  );
  const hasDenominationCount = Object.values(cashCounts).some((value) => value.trim() !== "");

  function updateCashDenomination(value: number, count: string) {
    const next = { ...cashCounts, [String(value)]: count };
    setCashCounts(next);
    const total = CASH_DENOMINATIONS.reduce((sum, denomination) => sum + denomination.value * (Number(next[String(denomination.value)]) || 0), 0);
    setCountedCash(Object.values(next).some((entry) => entry.trim() !== "") ? total.toFixed(2) : "");
  }

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
    return (
      <main role="status" aria-live="polite" className="mx-auto flex h-full max-w-2xl flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--oh-border)]" />
            <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-[var(--oh-border)]" />
          </div>
          <div className="h-11 w-28 animate-pulse rounded-lg bg-[var(--oh-border)]" />
        </header>
        <section aria-label="Loading register details" className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
          <div className="border-b border-[var(--oh-border)] pb-3">
            <div className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-[var(--oh-border)]" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="mt-4 grid gap-2 rounded-lg bg-[var(--oh-surface)] p-3 sm:grid-cols-2">
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)] sm:ml-auto" />
            <div className="h-4 w-16 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)] sm:ml-auto" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-[var(--oh-surface)]" />
          <div className="mt-5 h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
        </section>
        <p className="flex items-center justify-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" />Loading register and session details…</p>
      </main>
    );
  }

  if (error && connected !== true) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section role="alert" className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-rose-700" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load register details</h1>
          <p className="mt-2 text-sm leading-6 text-rose-800">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
        </section>
      </main>
    );
  }

  if (connected === false) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <CircleAlert className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to close a register</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Closing a register ends the open Odoo POS session for that terminal.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Close register</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">End the open Odoo POS session after reconciling cash.{lastLoadedAt !== null && <span className="ml-2">Last refreshed {new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(lastLoadedAt)}.</span>}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy} aria-label={loading ? "Refreshing registers" : "Refresh registers"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
      </header>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"><span>{error} Register details may be out of date.</span><button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 disabled:opacity-60">{loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}
      {result && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-950">
          <p className="font-semibold inline-flex items-center gap-2"><Check size={16} /> {result.registerName} · {result.sessionName}</p>
          <p className="mt-1">{result.message}</p>
          <p className="mt-1 text-xs">Odoo session state: <strong>{result.state}</strong></p>
        </div>
      )}

      <section aria-labelledby="close-register-form-heading" className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
        <div className="mb-4 border-b border-[var(--oh-border)] pb-3">
          <h2 id="close-register-form-heading" className="text-sm font-semibold text-[var(--oh-text)]">Session and cash count</h2>
          <p className="mt-0.5 text-xs leading-5 text-[var(--oh-muted)]">Review the active session before submitting its closing control.</p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
          Register
          <select
            value={configId ?? ""}
            disabled={!bootstrap?.configs.length || busy}
            onChange={(event) => {
              const nextId = Number(event.target.value);
      setConfigId(nextId);
      setCountedCash("");
      setCashCounts({});
              if (odooUserId) {
                try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${odooUserId}`, String(nextId)); } catch { /* Keep the current selection for this session. */ }
              }
            }}
            className="h-11 min-w-0 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)]"
          >
            {!bootstrap?.configs.length && <option value="">No POS registers available</option>}
            {bootstrap?.configs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}{config.session ? ` · ${config.session.name}` : " · No open session"}
              </option>
            ))}
          </select>
        </label>

        {!bootstrap?.configs.length ? (
          <div role="status" className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />No POS registers are available to this Odoo account.</span>
            <a href="https://odoo.orithos.com.au/odoo/point-of-sale" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Odoo POS</a>
          </div>
        ) : selected?.session ? (
          <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg bg-[var(--oh-surface)] p-3 text-sm sm:grid-cols-2">
            <dt className="text-[var(--oh-muted)]">Open session</dt>
            <dd className="min-w-0 break-words font-medium text-[var(--oh-text)] sm:text-right">{selected.session.name}</dd>
            <dt className="text-[var(--oh-muted)]">Started</dt>
            <dd className="min-w-0 text-[var(--oh-text-secondary)] sm:text-right">
              {selected.session.start_at
                ? formatOdooDateTime(String(selected.session.start_at), selected.timezone)
                : "—"}
            </dd>
          </dl>
        ) : (
          <div role="status" className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 sm:flex-row sm:items-center">
            <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />This register has no open session. Open one in Odoo before closing.</span>
            <a href="https://odoo.orithos.com.au/odoo/point-of-sale" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Odoo POS</a>
          </div>
        )}

        {selected?.session ? (
          <>
            <label className="mt-4 grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
              Counted cash {requiresCashCount ? "(required)" : "(optional)"}
              <input
                id="counted-cash"
                type="number"
                min="0"
                step="0.05"
                required={requiresCashCount}
                aria-describedby="counted-cash-help"
                value={countedCash}
                onChange={(event) => { setCountedCash(event.target.value); setCashCounts({}); }}
                placeholder={requiresCashCount ? "Amount counted in AUD" : "Optional cash count"}
                className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
              />
              <span id="counted-cash-help" className="text-xs font-normal leading-5 text-[var(--oh-muted)]">
                {requiresCashCount
                  ? "Required for this cash-enabled register. The counted amount is written to Odoo when you confirm."
                  : "This register has no cash payment method, so a cash count is optional."}
              </span>
            </label>

            <fieldset className="mt-4 border-t border-[var(--oh-border)] pt-4">
              <legend className="text-sm font-semibold text-[var(--oh-text)]">Count by denomination <span className="font-normal text-[var(--oh-muted)]">(optional)</span></legend>
              <p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">Enter the number of each note or coin. The total fills Counted cash automatically.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {CASH_DENOMINATIONS.map((denomination) => (
                  <label key={denomination.label} className="grid min-w-0 gap-1 text-xs font-medium text-[var(--oh-muted)]">
                    <span>{denomination.label}</span>
                    <input
                      aria-label={`${denomination.label} count`}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={cashCounts[String(denomination.value)] ?? ""}
                      onChange={(event) => updateCashDenomination(denomination.value, event.target.value)}
                      className="h-10 min-w-0 rounded-lg border border-[var(--oh-border)] bg-white px-2 text-sm font-normal tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
                    />
                  </label>
                ))}
              </div>
              <p role="status" className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">
                <span>{hasDenominationCount ? "Denomination total" : "No denomination count entered"}</span>
                <strong className="tabular-nums">{new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(denominationTotal)}</strong>
              </p>
            </fieldset>

            <p className="mt-3 rounded-lg bg-[var(--oh-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--oh-muted)]">
              Closing sends Odoo&apos;s session closing control. If cash differences remain, finish reconciliation in Odoo.
              Parked sales on this browser are local drafts and are not uploaded by close.
            </p>

            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!selected?.session || busy || (requiresCashCount && !countedCash.trim())}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {busy ? "Closing…" : "Review before closing"}
            </button>
          </>
        ) : null}
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
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="min-h-11 w-full rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto"
              >
                Keep session open
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                disabled={busy}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-danger)] px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-danger)] disabled:opacity-50 sm:w-auto"
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
