"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, LogIn, LogOut, RefreshCw } from "lucide-react";
import {
  getOdooPosBootstrap,
  getOdooSession,
  loginToOdoo,
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshConnection = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const sessionUser = await getOdooSession();
      setUser(sessionUser);
      if (!sessionUser) {
        setBootstrap(null);
        setState("disconnected");
        return;
      }
      const pos = await getOdooPosBootstrap();
      setBootstrap(pos);
      setState("connected");
      if (pos.message) setMessage(pos.message);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not connect to Odoo.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const sessionUser = await loginToOdoo(username.trim(), password);
      setPassword("");
      if (!sessionUser) throw new Error("Odoo did not return a valid user session.");
      setUser(sessionUser);
      const pos = await getOdooPosBootstrap();
      setBootstrap(pos);
      setState("connected");
      setMessage(pos.message ?? null);
    } catch (error) {
      setState("error");
      setMessage(error instanceof OdooApiError && error.status === 503
        ? "Odoo connection is not configured on the POS server."
        : error instanceof Error ? error.message : "Could not connect to Odoo.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      await logoutFromOdoo();
      setUser(null);
      setBootstrap(null);
      setState("disconnected");
      setMessage(null);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not disconnect from Odoo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Odoo point of sale</h2>
            {state === "connected" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14} /> Connected</span>
            ) : state === "error" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-800"><CircleAlert size={14} /> Attention needed</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--oh-muted)]">
            Connect your Odoo staff account to check the stores, open POS sessions and payment methods available to this user.
          </p>
        </div>
        {state === "connected" && (
          <button type="button" onClick={() => void refreshConnection()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
        )}
      </div>

      {state === "loading" ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Checking Odoo connection…</div>
      ) : state === "connected" ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--oh-surface)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--oh-text)]">{user?.name || user?.username}</p>
              <p className="text-xs text-[var(--oh-muted)]">Signed in as {user?.username}</p>
            </div>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
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
              <p className="rounded-lg border border-dashed border-[var(--oh-border)] px-4 py-5 text-sm text-[var(--oh-muted)]">This Odoo user cannot access a POS configuration. Check Odoo company and Point of Sale permissions.</p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">
            Odoo username
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" required maxLength={120} className="h-10 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-orange-100" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text-secondary)]">
            Odoo password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required maxLength={256} className="h-10 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-base font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange-dark)] focus:ring-2 focus:ring-orange-100" />
          </label>
          <button type="submit" disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />} Connect Odoo
          </button>
        </form>
      )}

      {message && <p role="status" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{message}</p>}
    </section>
  );
}
