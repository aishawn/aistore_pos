"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { ApiError, api } from "@/lib/api";
import { useParams } from "next/navigation";

interface ClosurePayment {
  id?: number;
  paymentMethodId?: number | null;
  expected?: number | null;
  received?: number | null;
}

interface RegisterClosure {
  id: number;
  registerId: number;
  userId: number;
  movement?: number | null;
  totalExpected?: number | null;
  totalReceived?: number | null;
  totalTransactions?: number | null;
  totalSurcharge?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
  note?: string | null;
  payments?: ClosurePayment[];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMoney(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export default function RegisterClosureDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [closure, setClosure] = useState<RegisterClosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!Number.isSafeInteger(id) || id < 1) {
      setError("Invalid register closure id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<RegisterClosure>(`/api/register-closures/${id}`);
      if (sequence === requestSequence.current) setClosure(result);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof ApiError ? cause.message : "Could not load register closure.");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <AdminPageLayout
      title={closure ? `Register closure #${closure.id}` : "Register closure"}
      subtitle="Read-only close summary and tender breakdown"
      actions={<div className="flex flex-wrap gap-2"><Link href="/reports/closures" className="inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">All closures</Link><AdminSecondaryButton onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}{loading ? "Refreshing…" : "Refresh"}</AdminSecondaryButton></div>}
    >
      {loading ? <div role="status" aria-label="Loading register closure" className="space-y-4"><div className="h-40 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /><div className="h-32 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /></div> : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : closure ? (
        <div className="mx-auto max-w-3xl space-y-5">
          <section className="rounded-lg border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]"><h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Summary</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-[var(--oh-muted)]">Register</dt><dd className="mt-0.5 font-medium text-[var(--oh-text)]">{closure.registerId}</dd></div><div><dt className="text-[var(--oh-muted)]">Staff user</dt><dd className="mt-0.5 text-[var(--oh-text)]">{closure.userId}</dd></div><div><dt className="text-[var(--oh-muted)]">Opened</dt><dd className="mt-0.5 text-[var(--oh-text)]">{formatDate(closure.openedAt)}</dd></div><div><dt className="text-[var(--oh-muted)]">Closed</dt><dd className="mt-0.5 text-[var(--oh-text)]">{formatDate(closure.closedAt)}</dd></div><div><dt className="text-[var(--oh-muted)]">Expected</dt><dd className="mt-0.5 font-medium text-[var(--oh-text)]">{formatMoney(closure.totalExpected)}</dd></div><div><dt className="text-[var(--oh-muted)]">Received</dt><dd className="mt-0.5 font-medium text-[var(--oh-text)]">{formatMoney(closure.totalReceived)}</dd></div><div><dt className="text-[var(--oh-muted)]">Transactions</dt><dd className="mt-0.5 text-[var(--oh-text)]">{closure.totalTransactions ?? "—"}</dd></div><div><dt className="text-[var(--oh-muted)]">Surcharge</dt><dd className="mt-0.5 text-[var(--oh-text)]">{formatMoney(closure.totalSurcharge)}</dd></div></dl></section>
          <section className="rounded-lg border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]"><h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Tender breakdown</h2>{closure.payments?.length ? <div className="mt-3 divide-y divide-[var(--oh-border)]">{closure.payments.map((payment, index) => <div key={payment.id ?? index} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-3 text-sm"><span className="text-[var(--oh-text-secondary)]">Payment method {payment.paymentMethodId ?? "—"}</span><span className="text-[var(--oh-muted)]">Expected {formatMoney(payment.expected)}</span><span className="font-medium text-[var(--oh-text)]">Received {formatMoney(payment.received)}</span></div>)}</div> : <p className="mt-3 text-sm text-[var(--oh-muted)]">No tender breakdown was recorded.</p>}</section>
          {closure.note ? <section className="rounded-lg border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]"><h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Note</h2><p className="mt-3 whitespace-pre-wrap text-sm text-[var(--oh-text-secondary)]">{closure.note}</p></section> : null}
        </div>
      ) : <p className="text-sm text-[var(--oh-muted)]">Register closure not found.</p>}
    </AdminPageLayout>
  );
}
