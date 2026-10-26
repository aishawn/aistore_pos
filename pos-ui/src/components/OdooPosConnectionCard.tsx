"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, LogOut, RefreshCw } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSessionStatus,
  logoutFromOdoo,
  OdooApiError,
  type OdooAuthUser,
  type OdooPosBootstrap,
} from "@/lib/odoo-api";

type ConnectionState = "loading" | "disconnected" | "connected" | "error";

export function OdooPosConnectionCard() {
  const [state, setState] = useState<ConnectionState>("loading");
  const [user, setUser] = useState<OdooAuthUser | null>(null);
  const [bootstrap, setBootstrap] = useState<OdooPosBootstrap | null>(null);
  const [autoRecoverConfigured, setAutoRecoverConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestRevision = useRef(0);

  const refreshConnection = useCallback(async () => {
    const revision = ++requestRevision.current;
    setBusy(true);
    setMessage(null);
    try {
      const session = await getOdooSessionStatus();
      if (revision !== requestRevision.current) return;
      setUser(session.user);
      setAutoRecoverConfigured(session.autoRecoverConfigured);
      if (!session.user) {
        setBootstrap(null);
        setState("disconnected");
        return;
      }
      const pos = await getOdooPosBootstrap();
      if (revision !== requestRevision.current) return;
      setBootstrap(pos);
      setState("connected");
      if (pos.message) setMessage(pos.message);
    } catch (error) {
      if (revision === requestRevision.current) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Could not connect to Orithos.");
      }
    } finally {
      if (revision === requestRevision.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  async function disconnect() {
    if (busy) return;
    const revision = ++requestRevision.current;
    setBusy(true);
    try {
      await logoutFromOdoo();
      if (revision !== requestRevision.current) return;
      setUser(null);
      setBootstrap(null);
      setState("disconnected");
      setMessage(null);
    } catch (error) {
      if (revision === requestRevision.current) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Could not disconnect from Orithos.");
      }
    } finally {
      if (revision === requestRevision.current) setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-base font-semibold text-[var(--oh-text)]">Orithos point of sale</h2>
            {state === "connected" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14} /> Connected</span>
            ) : state === "error" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-800"><CircleAlert size={14} /> Attention needed</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--oh-muted)]">
            Connect your Orithos staff account to check the stores, open POS sessions and payment methods available to this user.
          </p>
        </div>
        {state === "connected" && (
          <button type="button" onClick={() => void refreshConnection()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
        )}
      </div>

      {state === "loading" ? (
        <div role="status" aria-label="Checking Orithos connection" className="mt-5 space-y-3">
          <div className="flex items-center gap-3"><div className="h-11 w-11 animate-pulse rounded-md bg-[var(--oh-border)]" /><div className="flex-1"><div className="h-4 w-44 animate-pulse rounded bg-[var(--oh-border)]" /><div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-[var(--oh-border)]" /></div></div>
          <div className="h-11 w-full max-w-md animate-pulse rounded-md bg-[var(--oh-border)]" />
          <p className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Checking Orithos connection…</p>
        </div>
      ) : state === "connected" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--oh-surface)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--oh-text)]">{user?.name || user?.username}</p>
              <p className="text-xs text-[var(--oh-muted)]">Signed in as {user?.username}</p>
            </div>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
              {busy ? <LoaderCircle size={15} className="animate-spin" /> : <LogOut size={15} />} Disconnect
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {bootstrap?.configs.map((config) => (
              <article key={config.id} className="rounded-lg border border-[var(--oh-border)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--oh-text)]">{config.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">{config.company && config.company[1]}</p>
                  </div>
                  {config.session ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Open · {config.session.name}</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">No open session</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-[var(--oh-muted)]">
                  {config.paymentMethods.length ? `Payments: ${config.paymentMethods.map((method) => method.name).join(", ")}` : "No payment methods configured"}
                </p>
              </article>
            ))}
            {bootstrap?.configs.length === 0 && (
              <p className="rounded-lg border border-dashed border-[var(--oh-border)] px-4 py-5 text-sm text-[var(--oh-muted)]">This Orithos user cannot access a POS configuration. Check Orithos company and Point of Sale permissions.</p>
            )}
          </div>
        </div>
      ) : (
        <>
        {state === "error" && <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{autoRecoverConfigured ? "The Orithos service is reconnecting automatically." : "Connection status could not be confirmed."}</span>
          <button type="button" onClick={() => void refreshConnection()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 disabled:opacity-60"><RefreshCw size={15} /> Retry status check</button>
        </div>}
        {autoRecoverConfigured ? (
          <p className="mt-5 rounded-lg border border-dashed border-[var(--oh-border)] px-4 py-4 text-sm leading-6 text-[var(--oh-muted)]">
            Odoo is managed by the Orithos server. Your store connection is restored automatically when the session expires.
          </p>
        ) : null}
        </>
      )}

      {message && <p role={state === "error" ? "alert" : "status"} className={`mt-4 rounded-md border px-3 py-2 text-sm ${state === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>{message}</p>}
      <p className="mt-4 text-xs leading-5 text-[var(--oh-muted)]">
        {autoRecoverConfigured
          ? "Managed by Orithos server connection. No Odoo credentials are required on this device."
          : "The Orithos server service account is not configured. Ask an admin to configure ODOO_SERVICE_USERNAME and ODOO_SERVICE_PASSWORD."}
      </p>
    </section>
  );
}
