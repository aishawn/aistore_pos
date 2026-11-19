"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, CircleAlert, LoaderCircle, Minus, Plus, RefreshCw, X } from "lucide-react";
import {
  closeOdooPosSession,
  getOdooPosBootstrap,
  getOdooSession,
  type OdooPosBootstrap,
} from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { cn } from "@/lib/utils";

export const ODOO_REGISTER_CLOSED_EVENT = "orithos:odoo-register-closed";

const REGISTER_SELECTION_KEY = "orithos-odoo-register-v1";
const LONG_OPEN_HOURS = 24;
const MONEY = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

const COIN_DENOMINATIONS = [
  { value: 0.05, label: "$0.05" },
  { value: 0.1, label: "$0.10" },
  { value: 0.2, label: "$0.20" },
  { value: 0.5, label: "$0.50" },
  { value: 1, label: "$1" },
  { value: 2, label: "$2" },
] as const;

const NOTE_DENOMINATIONS = [
  { value: 5, label: "$5" },
  { value: 10, label: "$10" },
  { value: 20, label: "$20" },
  { value: 50, label: "$50" },
  { value: 100, label: "$100" },
] as const;

const CASH_DENOMINATIONS = [...COIN_DENOMINATIONS, ...NOTE_DENOMINATIONS] as const;

type CashEntryMode = "denomination" | "direct";

function parseOdooStartMs(startAt: string | false | undefined): number | null {
  if (!startAt || typeof startAt !== "string") return null;
  const normalized = startAt.includes("T") ? startAt : startAt.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized) ? normalized : `${normalized}Z`;
  const ms = new Date(withZone).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatOpenDuration(startAt: string | false | undefined): { label: string; longOpen: boolean } | null {
  const startMs = parseOdooStartMs(startAt);
  if (startMs == null) return null;
  const totalMinutes = Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return {
    label: parts.join(" "),
    longOpen: (Date.now() - startMs) >= LONG_OPEN_HOURS * 3_600_000,
  };
}

function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return MONEY.format(amount);
}

function dispatchRegisterClosed() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ODOO_REGISTER_CLOSED_EVENT));
}

export type OdooCloseRegisterFormProps = {
  variant?: "page" | "modal";
  /** When false, skip auto-load (e.g. modal closed). Defaults to true. */
  active?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onRequestClose?: () => void;
};

/** Shared close-register checklist used by `/close` and the POS/admin modal. */
export function OdooCloseRegisterForm({
  variant = "page",
  active = true,
  onBusyChange,
  onRequestClose,
}: OdooCloseRegisterFormProps) {
  const isModal = variant === "modal";
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [odooUserId, setOdooUserId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [cashCounts, setCashCounts] = useState<Record<string, string>>({});
  const [cashEntryMode, setCashEntryMode] = useState<CashEntryMode>("denomination");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const requestRevision = useRef(0);
  const closeAfterSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useDialogFocus(confirming, () => {
    if (!busy) setConfirming(false);
  });
  const [result, setResult] = useState<{ sessionName: string; registerName: string; state: string; message: string } | null>(null);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => () => {
    if (closeAfterSuccessTimer.current) clearTimeout(closeAfterSuccessTimer.current);
  }, []);

  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const user = await getOdooSession();
      if (revision !== requestRevision.current) return;
      setConnected(Boolean(user));
      setOdooUserId(user?.id ?? null);
      if (!user) {
        setBootstrap(null);
        return;
      }
      const data = await getOdooPosBootstrap();
      if (revision !== requestRevision.current) return;
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
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load Orithos registers.");
      }
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const selected = bootstrap?.configs.find((item) => item.id === configId) ?? null;
  const requiresCashCount = Boolean(selected?.paymentMethods.some((method) => method.is_cash_count));
  const expectedCash = selected?.session?.cashBalanceEnd ?? null;
  const openingFloat = selected?.session?.cashBalanceStart ?? null;
  const selectedStartAt = selected?.session?.start_at;
  const openDuration = formatOpenDuration(selectedStartAt);

  const denominationTotal = useMemo(
    () => CASH_DENOMINATIONS.reduce((total, denomination) => total + denomination.value * (Number(cashCounts[String(denomination.value)]) || 0), 0),
    [cashCounts],
  );
  const hasDenominationCount = Object.values(cashCounts).some((value) => value.trim() !== "");

  const countedAmount = useMemo(() => {
    if (cashEntryMode === "denomination") {
      return hasDenominationCount ? denominationTotal : null;
    }
    if (!countedCash.trim()) return null;
    const value = Number(countedCash);
    return Number.isFinite(value) ? value : null;
  }, [cashEntryMode, countedCash, denominationTotal, hasDenominationCount]);

  const difference = countedAmount != null && expectedCash != null
    ? Math.round((countedAmount - expectedCash) * 100) / 100
    : null;

  function resetCashInputs() {
    setCountedCash("");
    setCashCounts({});
    setCashEntryMode("denomination");
  }

  function updateCashDenomination(value: number, count: string) {
    const cleaned = count.replace(/[^\d]/g, "");
    const next = { ...cashCounts, [String(value)]: cleaned };
    setCashCounts(next);
  }

  function stepCashDenomination(value: number, delta: number) {
    const current = Number(cashCounts[String(value)]) || 0;
    const nextCount = Math.max(0, Math.min(9_999, current + delta));
    updateCashDenomination(value, nextCount === 0 ? "" : String(nextCount));
  }

  function switchCashEntryMode(mode: CashEntryMode) {
    if (mode === cashEntryMode) return;
    if (mode === "direct" && !countedCash.trim() && hasDenominationCount) {
      setCountedCash(denominationTotal.toFixed(2));
    }
    setCashEntryMode(mode);
  }

  async function handleClose() {
    if (!selected?.session || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const cash = countedAmount;
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
      resetCashInputs();
      dispatchRegisterClosed();
      await load();
      if (isModal && onRequestClose) {
        if (closeAfterSuccessTimer.current) clearTimeout(closeAfterSuccessTimer.current);
        closeAfterSuccessTimer.current = setTimeout(() => {
          onRequestClose();
        }, 1_200);
      }
    } catch (cause) {
      setConfirming(false);
      setError(cause instanceof Error ? cause.message : "Could not close the register.");
    } finally {
      setBusy(false);
    }
  }

  const countedCashValid = countedAmount == null
    || (Number.isFinite(countedAmount) && countedAmount >= 0 && countedAmount <= 1_000_000);
  const canReview = Boolean(selected?.session)
    && !busy
    && (!requiresCashCount || countedAmount != null)
    && countedCashValid;

  const shellClass = isModal
    ? "flex h-full min-h-0 flex-col bg-white"
    : "mx-auto flex h-full max-w-2xl flex-col bg-[var(--oh-surface)]";

  const scrollClass = isModal
    ? "min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
    : "min-h-0 flex-1 space-y-4 overflow-y-auto p-4 md:p-6";

  if (loading) {
    return (
      <div role="status" aria-live="polite" className={cn(shellClass, isModal ? "p-4 sm:p-5" : "gap-5 overflow-y-auto p-4 md:p-6")}>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="h-8 w-48 animate-pulse rounded-md bg-[var(--oh-border)]" />
            <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-[var(--oh-border)]" />
          </div>
          <div className="h-11 w-28 animate-pulse rounded-lg bg-[var(--oh-border)]" />
        </header>
        <section aria-label="Loading register details" className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
          <div className="h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="mt-4 grid gap-2 rounded-lg bg-[var(--oh-surface)] p-3 sm:grid-cols-3">
            <div className="h-14 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="h-14 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="h-14 animate-pulse rounded bg-[var(--oh-border)]" />
          </div>
          <div className="mt-4 h-40 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="mt-5 h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
        </section>
        <p className="flex items-center justify-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" />Loading register and session details…</p>
      </div>
    );
  }

  if (error && connected !== true) {
    return (
      <div className={cn(isModal ? "grid place-items-center p-6" : "grid h-full place-items-center bg-[var(--oh-surface)] p-6")}>
        <section role="alert" className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-rose-700" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load register details</h1>
          <p className="mt-2 text-sm leading-6 text-rose-800">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={16} /> Retry</button>
        </section>
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className={cn(isModal ? "grid place-items-center p-6" : "grid h-full place-items-center bg-[var(--oh-surface)] p-6")}>
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <CircleAlert className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Orithos to close a register</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Closing a register ends the open Orithos POS session for that terminal.</p>
          <Link
            href="/settings/integrations"
            onClick={onRequestClose}
            className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            Connect Orithos
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className={scrollClass}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className={cn(isModal ? "text-lg font-semibold text-[var(--oh-text)]" : "oh-type-title text-[var(--oh-text)]")}>
              Close register
            </h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">
              Reconcile the drawer, then end the open Orithos POS session.
              {lastLoadedAt !== null && (
                <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, selected?.timezone ?? bootstrap?.configs[0]?.timezone ?? "Australia/Adelaide")}.</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              aria-label={loading ? "Refreshing registers" : "Refresh registers"}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60",
                isModal ? "h-10 w-10" : "min-h-11 px-3",
              )}
            >
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {!isModal ? <>Refresh</> : null}
            </button>
            {isModal && onRequestClose ? (
              <button
                type="button"
                onClick={onRequestClose}
                disabled={busy}
                aria-label="Close dialog"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"
              >
                <X size={18} />
              </button>
            ) : null}
          </div>
        </header>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">
            <span>{error} Register details may be out of date.</span>
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
              {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry
            </button>
          </div>
        )}
        {result && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-950">
            <p className="inline-flex items-center gap-2 font-semibold"><Check size={16} /> {result.registerName} · {result.sessionName}</p>
            <p className="mt-1">{result.message}</p>
            <p className="mt-1 text-xs">Orithos session state: <strong>{result.state}</strong></p>
          </div>
        )}

        <section aria-labelledby="close-register-form-heading" className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
          <div className="mb-4 border-b border-[var(--oh-border)] pb-3">
            <h2 id="close-register-form-heading" className="text-sm font-semibold text-[var(--oh-text)]">End-of-day checklist</h2>
            <p className="mt-0.5 text-xs leading-5 text-[var(--oh-muted)]">Count the drawer against Orithos expected cash, then review before closing.</p>
          </div>

          <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">
            Register
            <select
              value={configId ?? ""}
              disabled={!bootstrap?.configs.length || busy}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                setConfigId(nextId);
                resetCashInputs();
                if (odooUserId) {
                  try { localStorage.setItem(`${REGISTER_SELECTION_KEY}:${odooUserId}`, String(nextId)); } catch { /* Keep the current selection for this session. */ }
                }
              }}
              className="h-11 min-w-0 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)]"
            >
              {!bootstrap?.configs.length && <option value="">No POS registers available</option>}
              {bootstrap?.configs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.name}{config.session ? ` · open` : " · no session"}
                </option>
              ))}
            </select>
          </label>

          {!bootstrap?.configs.length ? (
            <div role="status" className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />No POS registers are available to this Orithos account.</span>
              <Link href="/" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Orithos POS</Link>
            </div>
          ) : selected?.session ? (
            <>
              <div className="mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Open session</p>
                    <p className="mt-0.5 break-words text-sm font-semibold text-[var(--oh-text)]">{selected.session.name}</p>
                    <p className="mt-1 text-xs text-[var(--oh-text-secondary)]">
                      Started {selected.session.start_at
                        ? formatOdooDateTime(String(selected.session.start_at), selected.timezone)
                        : "—"}
                      {openDuration && <> · Open {openDuration.label}</>}
                    </p>
                  </div>
                  {openDuration?.longOpen && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                      <AlertCircle size={14} /> Open over {LONG_OPEN_HOURS}h
                    </span>
                  )}
                </div>
                {openingFloat != null && (
                  <p className="mt-2 text-xs text-[var(--oh-muted)]">Opening float {formatMoney(openingFloat)}</p>
                )}
              </div>

              <div
                role="status"
                aria-label="Cash reconciliation summary"
                className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                <div className="rounded-lg border border-[var(--oh-border)] bg-white px-3 py-3">
                  <p className="text-xs font-medium text-[var(--oh-muted)]">Expected cash</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(expectedCash)}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--oh-muted)]">From Orithos drawer balance</p>
                </div>
                <div className="rounded-lg border border-[var(--oh-border)] bg-white px-3 py-3">
                  <p className="text-xs font-medium text-[var(--oh-muted)]">Counted</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(countedAmount)}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--oh-muted)]">
                    {cashEntryMode === "denomination" ? "From denomination count" : "Entered total"}
                  </p>
                </div>
                <div className={`rounded-lg border px-3 py-3 ${
                  difference == null
                    ? "border-[var(--oh-border)] bg-white"
                    : Math.abs(difference) < 0.005
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-rose-200 bg-rose-50"
                }`}>
                  <p className="text-xs font-medium text-[var(--oh-muted)]">Difference</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${
                    difference == null
                      ? "text-[var(--oh-text)]"
                      : Math.abs(difference) < 0.005
                        ? "text-emerald-900"
                        : "text-rose-900"
                  }`}>
                    {difference == null ? "—" : formatMoney(difference)}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--oh-muted)]">Counted − expected</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Cash count method">
                <button
                  type="button"
                  onClick={() => switchCashEntryMode("denomination")}
                  className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${
                    cashEntryMode === "denomination"
                      ? "bg-[var(--oh-primary)] text-white"
                      : "border border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
                  }`}
                >
                  Count by denomination
                </button>
                <button
                  type="button"
                  onClick={() => switchCashEntryMode("direct")}
                  className={`inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${
                    cashEntryMode === "direct"
                      ? "bg-[var(--oh-primary)] text-white"
                      : "border border-[var(--oh-border)] bg-white text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
                  }`}
                >
                  Enter total
                </button>
              </div>

              {cashEntryMode === "direct" ? (
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
                    onChange={(event) => setCountedCash(event.target.value)}
                    placeholder={requiresCashCount ? "Amount counted in AUD" : "Optional cash count"}
                    className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
                  />
                  <span id="counted-cash-help" className="text-xs font-normal leading-5 text-[var(--oh-muted)]">
                    {requiresCashCount
                      ? "Required for this cash-enabled register. Written to Orithos when you confirm."
                      : "This register has no cash payment method, so a cash count is optional."}
                  </span>
                </label>
              ) : (
                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold text-[var(--oh-text)]">
                    Count by denomination {requiresCashCount ? <span className="font-normal text-[var(--oh-muted)]">(required)</span> : <span className="font-normal text-[var(--oh-muted)]">(optional)</span>}
                  </legend>
                  <p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">Enter the number of each note or coin. The total updates Counted above.</p>

                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Coins</p>
                  <ul className="mt-2 grid gap-2">
                    {COIN_DENOMINATIONS.map((denomination) => (
                      <DenominationRow
                        key={denomination.label}
                        label={denomination.label}
                        value={cashCounts[String(denomination.value)] ?? ""}
                        onStep={(delta) => stepCashDenomination(denomination.value, delta)}
                        onChange={(next) => updateCashDenomination(denomination.value, next)}
                      />
                    ))}
                  </ul>

                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Notes</p>
                  <ul className="mt-2 grid gap-2">
                    {NOTE_DENOMINATIONS.map((denomination) => (
                      <DenominationRow
                        key={denomination.label}
                        label={denomination.label}
                        value={cashCounts[String(denomination.value)] ?? ""}
                        onStep={(delta) => stepCashDenomination(denomination.value, delta)}
                        onChange={(next) => updateCashDenomination(denomination.value, next)}
                      />
                    ))}
                  </ul>

                  <p role="status" className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">
                    <span>{hasDenominationCount ? "Denomination total" : "No denomination count entered"}</span>
                    <strong className="tabular-nums">{formatMoney(denominationTotal)}</strong>
                  </p>
                </fieldset>
              )}
            </>
          ) : (
            <div role="status" className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-950 sm:flex-row sm:items-center">
              <span className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                This register has no open session. Open one from Sell or Orithos before closing.
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Link
                  href="/"
                  onClick={onRequestClose}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                >
                  Go to Sell
                </Link>
                <Link href="/" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Open Orithos POS</Link>
              </div>
            </div>
          )}
        </section>
      </div>

      {selected?.session && (
        <div className={cn("shrink-0 border-t border-[var(--oh-border)] bg-white px-4 py-3", isModal ? "sm:px-5" : "md:px-6")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[var(--oh-muted)] sm:max-w-sm">
              {countedAmount != null
                ? <>Recording {formatMoney(countedAmount)}{difference != null && Math.abs(difference) >= 0.005 ? <> · difference {formatMoney(difference)}</> : null}</>
                : requiresCashCount
                  ? "Count the drawer before reviewing close."
                  : "Cash count is optional for this register."}
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canReview}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[12rem]"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {busy ? "Closing…" : "Review before closing"}
            </button>
          </div>
        </div>
      )}

      {confirming && selected?.session && (
        <div className={cn("fixed inset-0 grid place-items-center bg-black/40 p-4", isModal ? "z-[80]" : "z-50")}>
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="close-register-title"
            aria-describedby="close-register-description"
            className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-2xl"
          >
            <h2 id="close-register-title" className="text-lg font-semibold text-[var(--oh-text)]">Close this Orithos session?</h2>
            <p id="close-register-description" className="mt-2 text-sm leading-6 text-[var(--oh-text-secondary)]">
              This will send the closing request for <strong>{selected.name}</strong> · <strong>{selected.session.name}</strong>.
              Check the cash count and make sure all sales are reconciled before continuing.
            </p>
            <dl className="mt-3 grid gap-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--oh-muted)]">Expected</dt>
                <dd className="font-medium tabular-nums">{formatMoney(expectedCash)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--oh-muted)]">Counted</dt>
                <dd className="font-medium tabular-nums">{formatMoney(countedAmount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--oh-muted)]">Difference</dt>
                <dd className={`font-semibold tabular-nums ${
                  difference == null
                    ? ""
                    : Math.abs(difference) < 0.005
                      ? "text-emerald-800"
                      : "text-rose-800"
                }`}>
                  {formatMoney(difference)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
              Parked sales on this browser are local drafts and are not uploaded by close.
              If cash differences remain, finish reconciliation in Orithos.
            </p>
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
    </div>
  );
}

function DenominationRow({
  label,
  value,
  onStep,
  onChange,
}: {
  label: string;
  value: string;
  onStep: (delta: number) => void;
  onChange: (next: string) => void;
}) {
  const count = Number(value) || 0;
  return (
    <li className="grid grid-cols-[4.5rem_1fr] items-center gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2">
      <span className="text-sm font-semibold tabular-nums text-[var(--oh-text)]">{label}</span>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label} count`}
          onClick={() => onStep(-1)}
          disabled={count <= 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] text-[var(--oh-text)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={16} />
        </button>
        <input
          aria-label={`${label} count`}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-16 rounded-lg border border-[var(--oh-border)] bg-white px-2 text-center text-sm font-medium tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
        />
        <button
          type="button"
          aria-label={`Increase ${label} count`}
          onClick={() => onStep(1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] text-[var(--oh-text)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <Plus size={16} />
        </button>
      </div>
    </li>
  );
}
