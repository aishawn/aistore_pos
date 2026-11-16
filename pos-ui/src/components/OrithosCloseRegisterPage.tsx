"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  closeRetailRegisterSession,
  getRetailRegisterSessionSummary,
  listRetailRegisters,
  type RetailRegister,
  type RetailRegisterClosure,
  type RetailRegisterSessionSummary,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readRegisterId, WORK_CONTEXT_EVENT, writeRegisterContext, writeWorkActivity } from "@/lib/work-context";

type CloseAttempt = {
  key: string;
  registerId: number;
  payload: { countedCash: number; countedTenders: Record<number, number>; note?: string };
};
const PENDING_CLOSE_KEY = "orithos.native-register-close.pending.v1";
const money = (amount: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

export function OrithosCloseRegisterPage() {
  const { user, setWorkContext } = useAuth();
  const [registers, setRegisters] = useState<RetailRegister[]>([]);
  const [registerId, setRegisterId] = useState<number | null>(null);
  const [summary, setSummary] = useState<RetailRegisterSessionSummary | null>(null);
  const [countedCash, setCountedCash] = useState("");
  const [countedTenders, setCountedTenders] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [closure, setClosure] = useState<RetailRegisterClosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attempt = useRef<CloseAttempt | null>(null);

  const load = useCallback(async (preferredId?: number | null) => {
    setError(null);
    try {
      const rows = await listRetailRegisters();
      setRegisters(rows);
      const preferred = preferredId ?? readRegisterId();
      const ordered = [...rows].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
      let selectedId: number | null = null;
      let selectedSummary: RetailRegisterSessionSummary | null = null;
      for (const item of ordered) {
        try {
          selectedSummary = await getRetailRegisterSessionSummary(item.id);
          selectedId = item.id;
          break;
        } catch (cause) {
          if (!(cause instanceof ApiError && cause.status === 409)) throw cause;
        }
      }
      const activeRegisterId = selectedId ?? preferred ?? rows[0]?.id ?? null;
      setRegisterId(activeRegisterId);
      if (activeRegisterId && user?.outletId) writeRegisterContext(user.outletId, activeRegisterId);
      setSummary(selectedSummary);
      setCountedCash("");
      setCountedTenders(Object.fromEntries((selectedSummary?.tenders ?? []).map((tender) => [tender.paymentMethodId, ""])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Register totals could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user?.outletId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = JSON.parse(sessionStorage.getItem(PENDING_CLOSE_KEY) ?? "null") as Partial<CloseAttempt> | null;
        if (!value || typeof value.key !== "string" || !Number.isSafeInteger(value.registerId) || !value.payload
            || typeof value.payload.countedCash !== "number" || typeof value.payload.countedTenders !== "object") return;
        attempt.current = value as CloseAttempt;
        setPending(true);
        setRegisterId(value.registerId as number);
      } catch { /* Ignore invalid or unavailable browser storage. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const hasCount = Boolean(countedCash.trim())
      || Object.values(countedTenders).some((value) => value.trim().length > 0);
    const active = pending || hasCount;
    const update = () => writeWorkActivity(active, user.id, pending ? "operation" : "unsaved");
    update();
    if (!active) return () => writeWorkActivity(false, user.id);
    const heartbeat = window.setInterval(update, 60_000);
    return () => {
      window.clearInterval(heartbeat);
      writeWorkActivity(false, user.id);
    };
  }, [pending, countedCash, countedTenders, user?.id]);

  useEffect(() => {
    const reloadContext = () => { setClosure(null); setLoading(true); void load(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "orithos_work_outlet_id" || event.key === "orithos_work_register_id") reloadContext();
    };
    window.addEventListener(WORK_CONTEXT_EVENT, reloadContext);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(WORK_CONTEXT_EVENT, reloadContext);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);

  const selectedRegister = registers.find((register) => register.id === registerId) ?? null;

  async function submitClose() {
    if (attempt.current) {
      await retryClose(attempt.current);
      return;
    }
    if (!summary || !registerId) return;
    const cash = Number(countedCash);
    if (!countedCash.trim() || !Number.isFinite(cash) || cash < 0) {
      setError("Enter the total physical cash counted in the drawer.");
      return;
    }
    const tenders: Record<number, number> = {};
    for (const tender of summary.tenders) {
      const raw = countedTenders[tender.paymentMethodId] ?? "";
      const value = Number(raw);
      if (!raw.trim() || !Number.isFinite(value) || value < 0) {
        setError(`Enter the counted total for ${tender.name}.`);
        return;
      }
      tenders[tender.paymentMethodId] = value;
    }
    await retryClose({
      key: crypto.randomUUID(),
      registerId,
      payload: { countedCash: cash, countedTenders: tenders, note: note.trim() || undefined },
    });
  }

  async function retryClose(next: CloseAttempt) {
    attempt.current = next;
    setPending(true);
    setBusy(true);
    setError(null);
    try { sessionStorage.setItem(PENDING_CLOSE_KEY, JSON.stringify(next)); } catch { /* Server idempotency still protects this attempt. */ }
    try {
      setClosure(await closeRetailRegisterSession(next.registerId, next.payload, next.key));
      attempt.current = null;
      setPending(false);
      try { sessionStorage.removeItem(PENDING_CLOSE_KEY); } catch { /* The close confirmation remains visible. */ }
      setSummary(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        attempt.current = null;
        setPending(false);
        try { sessionStorage.removeItem(PENDING_CLOSE_KEY); } catch { /* Keep the operator in control. */ }
      }
      setError(cause instanceof Error ? cause.message : "Register close failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col gap-4 p-4 text-[var(--oh-text)] lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
        <div><h1 className="text-xl font-semibold">Close register</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Orithos session · {selectedRegister?.name ?? "No active session"}</p></div>
        <div className="flex items-center gap-2">
          <select aria-label="Register" value={registerId ?? ""} disabled={pending || busy} onChange={(event) => {
            const id = Number(event.target.value);
            if (!user?.outletId) return;
            if ((countedCash.trim() || Object.values(countedTenders).some((value) => value.trim()))
                && !window.confirm("Changing register will clear the current cash count. Continue?")) return;
            void setWorkContext({ outletId: user.outletId, registerId: id, globalMode: false }).then(() => {
              writeRegisterContext(user.outletId!, id);
            }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not change register."));
          }} className="h-10 min-w-40 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm">
            <option value="" disabled>Select register</option>
            {registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
          </select>
          <button type="button" title="Refresh register totals" aria-label="Refresh register totals" onClick={() => { setLoading(true); void load(registerId); }} className="grid size-10 place-items-center rounded border border-[var(--oh-border)]"><RefreshCw size={17} /></button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
      {pending && <div role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Close response is pending. Retry the same close request to confirm its result.</div>}
      {closure && <section role="status" className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-900"><strong>Register closed · {closure.id}</strong><p className="mt-2">Expected {money(closure.totalExpected)} · Counted {money(closure.totalReceived)} · Difference {money(closure.movement)}</p></section>}

      {loading ? <div className="grid min-h-48 place-items-center text-[var(--oh-muted)]"><LoaderCircle className="animate-spin" /></div>
        : !summary ? pending ? <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><span>The original close request can be safely retried even if the session has already closed.</span><button type="button" disabled={busy} onClick={() => { if (attempt.current) void retryClose(attempt.current); }} className="h-10 rounded bg-amber-800 px-4 font-semibold text-white disabled:opacity-50">{busy ? "Checking…" : "Retry same close"}</button></section>
          : <section className="rounded border border-dashed border-[var(--oh-border)] p-6 text-sm text-[var(--oh-muted)]">There is no open Orithos register session to close.</section>
          : <>
            <section className="grid gap-3 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 sm:grid-cols-3">
              <div><p className="text-xs text-[var(--oh-muted)]">Opened</p><p className="mt-1 text-sm">{new Date(summary.openedAt).toLocaleString("en-AU")}</p></div>
              <div><p className="text-xs text-[var(--oh-muted)]">Transactions</p><p className="mt-1 text-sm">{summary.transactionCount}</p></div>
              <div><p className="text-xs text-[var(--oh-muted)]">Opening float</p><p className="mt-1 text-sm">{money(summary.openingFloat)}</p></div>
              <div><p className="text-xs text-[var(--oh-muted)]">Cash movements</p><p className="mt-1 text-sm">{money(summary.cashMovements)}</p></div>
              <div><p className="text-xs text-[var(--oh-muted)]">Expected drawer cash</p><p className="mt-1 text-base font-semibold">{money(summary.expectedCash)}</p></div>
            </section>

            {(summary.unsettledSales > 0 || summary.unmappedPayments > 0) && <section role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">Close is blocked: {summary.unsettledSales > 0 && `${summary.unsettledSales} unpaid sale(s)`}{summary.unsettledSales > 0 && summary.unmappedPayments > 0 && " · "}{summary.unmappedPayments > 0 && `${summary.unmappedPayments} payment(s) have no mapped tender`}.</section>}

            {summary.tenders.length > 0 && <section className="border-b border-[var(--oh-border)] pb-3"><h2 className="mb-2 font-semibold">Non-cash tender totals</h2><div className="divide-y divide-[var(--oh-border)]">{summary.tenders.map((tender) => <label key={tender.paymentMethodId} className="grid grid-cols-[minmax(0,1fr)_minmax(100px,160px)] items-center gap-3 py-3 text-sm"><span>{tender.name}<small className="ml-2 text-[var(--oh-muted)]">Expected {money(tender.expectedAmount)}</small></span><input inputMode="decimal" disabled={pending} aria-label={`Counted ${tender.name}`} value={countedTenders[tender.paymentMethodId] ?? ""} onChange={(event) => setCountedTenders((current) => ({ ...current, [tender.paymentMethodId]: event.target.value }))} className="h-10 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-right" /></label>)}</div></section>}

            <section className="grid gap-3 border-b border-[var(--oh-border)] pb-4 sm:grid-cols-[1fr_200px] sm:items-end">
              <div><h2 className="font-semibold">Cash count</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Count all cash in the drawer, including the opening float and cash movements.</p></div>
              <label className="grid gap-1 text-sm">Counted cash (AUD)<input inputMode="decimal" disabled={pending} value={countedCash} onChange={(event) => setCountedCash(event.target.value)} className="h-10 rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3" /></label>
            </section>

            <label className="grid gap-1 text-sm">Note<textarea value={note} disabled={pending} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3" /></label>
            <button type="button" onClick={() => void submitClose()} disabled={busy || summary.unsettledSales > 0 || summary.unmappedPayments > 0} className="h-12 rounded bg-[var(--oh-orange)] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Closing…" : pending ? "Retry same close" : "Confirm and close register"}</button>
          </>}
    </main>
  );
}
