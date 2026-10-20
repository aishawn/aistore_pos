"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, RefreshCw, Wallet } from "lucide-react";
import {
  AdminPageLayout,
} from "@/components/admin/AdminPageLayout";
import { getOdooPosBootstrap, postOdooSessionCash, type OdooPosBootstrap } from "@/lib/odoo-api";

export default function ManageCashPage() {
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configId, setConfigId] = useState<number | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getOdooPosBootstrap();
        if (cancelled) return;
        setBootstrap(data);
        const open = data.configs.find((config) => config.session);
        setConfigId(open?.id ?? data.configs[0]?.id ?? null);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load POS session.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  const selected = bootstrap?.configs.find((config) => config.id === configId) ?? null;
  const openSession = selected?.session ?? null;

  async function submit() {
    if (!configId || busy) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await postOdooSessionCash({
        configId,
        direction,
        amount: value,
        reason: reason.trim() || undefined,
      });
      setSuccess(`${direction === "in" ? "Cash in" : "Cash out"} $${value.toFixed(2)} recorded on ${result.sessionName}.`);
      setAmount("");
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cash adjustment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Manage Cash"
      subtitle="Cash in / cash out while a POS session is open. End-of-day counted cash still uses Close Register."
    >
      {loading ? (
      <div role="status" aria-live="polite" aria-label="Loading cash register" aria-busy="true" className="mx-auto w-full max-w-xl space-y-4 rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
          <div className="flex items-start gap-3"><div className="h-11 w-11 animate-pulse rounded-full bg-[var(--oh-border)]" /><div className="flex-1"><div className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)]" /><div className="mt-2 h-3 w-full max-w-md animate-pulse rounded bg-[var(--oh-border)]" /></div></div>
          <div className="h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <div className="grid grid-cols-2 gap-2"><div className="h-11 animate-pulse rounded-lg bg-[var(--oh-border)]" /><div className="h-11 animate-pulse rounded-lg bg-[var(--oh-border)]" /></div>
          <div className="h-11 w-full animate-pulse rounded-lg bg-[var(--oh-border)]" />
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading register session…</p>
        </div>
      ) : error && !bootstrap ? (
        <section role="alert" className="mx-auto w-full max-w-xl rounded-xl border border-rose-200 bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-rose-700" size={30} />
          <h2 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load cash register details</h2>
          <p className="mt-2 text-sm leading-6 text-rose-800">{error}</p>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
        </section>
      ) : (
        <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
              <Wallet size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--oh-text)]">Open session required</p>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">
                Mid-shift drawer adjustments write to Odoo. Closing the register still requires a counted cash amount.
              </p>
            </div>
          </div>

          {!bootstrap?.configs.length ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              No Odoo registers are available. <Link href="/settings/integrations" className="font-semibold text-[var(--oh-primary)] hover:underline">Connect Odoo</Link>
            </p>
          ) : (
            <>
              <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">
                Register
                <select
                  value={configId ?? ""}
                  onChange={(event) => setConfigId(Number(event.target.value))}
                  className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
                >
                  {bootstrap.configs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}{config.session ? " · open" : " · closed"}
                    </option>
                  ))}
                </select>
              </label>

              {!openSession ? (
                <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                  Open a POS session on this register before managing cash. Use Sell or Close Register flows to open a session.
                </p>
              ) : (
                <>
                  <p className="text-sm text-[var(--oh-text-secondary)]">Session <strong className="text-[var(--oh-text)]">{openSession.name}</strong></p>
                  <div role="group" aria-label="Cash adjustment direction" className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={direction === "in"} onClick={() => setDirection("in")} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${direction === "in" ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]" : "border-[var(--oh-border)] text-[var(--oh-text)]"}`}>Cash in</button>
                    <button type="button" aria-pressed={direction === "out"} onClick={() => setDirection("out")} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] ${direction === "out" ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]" : "border-[var(--oh-border)] text-[var(--oh-text)]"}`}>Cash out</button>
                  </div>
                  <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">
                    Amount (AUD)
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="h-11 rounded-lg border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
                      placeholder="0.00"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">
                    Reason (optional)
                    <input
                      type="text"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      maxLength={200}
                      className="h-11 rounded-lg border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
                      placeholder="Float top-up, petty cash…"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] disabled:opacity-60"
                  >
                    {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
                    {busy ? "Recording…" : `Record cash ${direction}`}
                  </button>
                  <p className="text-xs text-[var(--oh-muted)]">
                    End of day: use <Link href="/close/odoo" className="font-semibold text-[var(--oh-primary)] hover:underline">Close Register</Link> with counted cash.
                  </p>
                </>
              )}
            </>
          )}

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{success}</p>}
        </div>
      )}
    </AdminPageLayout>
  );
}
