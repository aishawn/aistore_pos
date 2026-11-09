"use client";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, RefreshCw } from "lucide-react";
import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";
import { api, ApiError } from "@/lib/api";
import { getOdooPosBootstrap, getOdooSession, type OdooPosBootstrap } from "@/lib/odoo-api";

type PaymentRow = {
  id: number;
  name: string;
  type: string;
  registers: string[];
};

type RegisterPaymentMethod = {
  paymentMethodId: number;
  name: string;
  type: string;
  registerId: number;
  registerName: string;
};

type RegisterPaymentMethodResponse = {
  nativePosEnabled: boolean;
  assignments: RegisterPaymentMethod[];
};

function paymentType(type: string, isCash: boolean) {
  const normalized = type.toLowerCase();
  if (isCash || normalized === "cash") return "Cash";
  if (["bank", "card", "eftpos"].includes(normalized)) return "Card / bank";
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toRows(data: RegisterPaymentMethod[]): PaymentRow[] {
  const methods = new Map<number, PaymentRow>();
  for (const assignment of data) {
    const existing = methods.get(assignment.paymentMethodId);
    if (existing) {
      if (!existing.registers.includes(assignment.registerName)) existing.registers.push(assignment.registerName);
    } else {
      methods.set(assignment.paymentMethodId, {
        id: assignment.paymentMethodId,
        name: assignment.name,
        type: paymentType(assignment.type, assignment.type === "CASH"),
        registers: [assignment.registerName],
      });
    }
  }
  return [...methods.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function toOdooRows(data: OdooPosBootstrap): PaymentRow[] {
  const methods = new Map<number, PaymentRow>();
  for (const config of data.configs) {
    for (const method of config.paymentMethods) {
      const existing = methods.get(method.id);
      if (existing) {
        if (!existing.registers.includes(config.name)) existing.registers.push(config.name);
      } else {
        methods.set(method.id, {
          id: method.id,
          name: method.name,
          type: paymentType(method.type, method.is_cash_count),
          registers: [config.name],
        });
      }
    }
  }
  return [...methods.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function PaymentMethodsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const source = await api.get<RegisterPaymentMethodResponse>("/api/retail/payment-methods");
        if (source.nativePosEnabled) {
          if (active) setRows(toRows(source.assignments));
          return;
        }
        const session = await getOdooSession();
        if (!session) throw new Error("Payment configuration is unavailable for this store.");
        const bootstrap = await getOdooPosBootstrap();
        if (active) setRows(toOdooRows(bootstrap));
      } catch (cause) {
        if (active) setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not load payment methods.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [retryKey]);

  return (
    <AdminPageLayout
      title="Payment Methods"
      subtitle="Payment methods assigned to your Orithos POS registers"
      count={loading || error ? undefined : rows.length}
      countLabel="Methods"
      actions={
        <AdminSecondaryButton onClick={() => { setError(null); setLoading(true); setRetryKey((value) => value + 1); }} disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </AdminSecondaryButton>
      }
      toolbar={<StoreSettingsTabs activeHref="/settings/payment" />}
    >
      <section aria-label="Payment method source" className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <Info size={18} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" />
        <div><p className="font-semibold text-[var(--oh-text)]">Register payment methods <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--oh-muted)]">Read only</span></p>
          <p className="mt-1">Payment methods are shown from the active store ledger.</p></div>
      </section>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>{error}</span>
          <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setError(null); setLoading(true); setRetryKey((value) => value + 1); }} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : undefined} /> {loading ? "Retrying…" : "Retry"}</button>
            <Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)]" href="/settings/account?tab=connection">View connection status</Link>
          </div>
        </div>
      ) : loading ? (
      <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading Orithos payment methods" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="h-12 animate-pulse bg-[var(--oh-surface)]" />
          <div className="divide-y divide-[var(--oh-border)]">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 sm:grid-cols-3">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--oh-surface)]" />
            </div>)}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          No payment methods are assigned to the Orithos POS registers available to this account.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {rows.map((row) => <article key={row.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-semibold text-[var(--oh-text)]">{row.name}</h2>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${row.type === "Cash" ? "bg-emerald-50 text-emerald-800" : row.type === "Card / bank" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-900"}`}>{row.type}</span>
              </div>
              <div className="mt-3 border-t border-[var(--oh-border)] pt-3">
                <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos registers</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{row.registers.map((register) => <span key={register} className="rounded-md bg-[var(--oh-surface)] px-2 py-1 text-sm text-[var(--oh-text-secondary)]">{register}</span>)}</div>
              </div>
            </article>)}
          </div>
          <div className="hidden overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white xl:block">
            <table aria-label="Orithos payment methods" className="w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th scope="col" className="px-4 py-3">Payment method</th><th scope="col" className="px-4 py-3">Type</th><th scope="col" className="px-4 py-3">Orithos register</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {rows.map((row) => <tr key={row.id} className="hover:bg-sky-50/40"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{row.name}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{row.type}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{row.registers.join(", ")}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
