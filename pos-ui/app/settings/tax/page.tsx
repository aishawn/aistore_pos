"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, RefreshCw } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { getOdooSession, searchOdooRecords, type OdooTaxRecord } from "@/lib/odoo-api";

function formatRate(tax: OdooTaxRecord) {
  if (tax.amount_type === "percent" || tax.amount_type === "division") return `${tax.amount}%`;
  if (tax.amount_type === "fixed") return `$${tax.amount.toFixed(2)} / unit`;
  if (tax.amount_type === "group") return "Group of taxes";
  return `${tax.amount} (${tax.amount_type})`;
}

export default function TaxRatesPage() {
  const [taxes, setTaxes] = useState<OdooTaxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const session = await getOdooSession();
        if (!session) throw new Error("Connect your Odoo staff account to view live tax rates.");
        const result = await searchOdooRecords<OdooTaxRecord>("taxes", { limit: 100 });
        if (active) setTaxes(result.items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Odoo tax rates.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [retryKey]);

  return (
    <AdminPageLayout
      title="Tax Rates"
      subtitle="Active sales taxes visible to your Odoo account"
      count={loading || error ? undefined : taxes.length}
      countLabel="Rates"
    >
      <section aria-label="Tax rate source" className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <Info size={18} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" />
        <div><p className="font-semibold text-[var(--oh-text)]">Live from Odoo <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--oh-muted)]">Read only</span></p>
          <p className="mt-1">Tax rates used in sales are controlled by Odoo. Orithos does not save a second copy.</p></div>
      </section>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>{error}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRetryKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : undefined} /> {loading ? "Retrying…" : "Retry"}</button>
            <Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)]" href="/settings/integrations">Open Integrations</Link>
          </div>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Loading Odoo tax rates" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="h-12 animate-pulse bg-[var(--oh-surface)]" />
          <div className="divide-y divide-[var(--oh-border)]">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 sm:grid-cols-4">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-32 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-28 animate-pulse rounded bg-[var(--oh-surface)]" />
            </div>)}
          </div>
        </div>
      ) : taxes.length === 0 ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          No active sales tax rates are visible to this Odoo account.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {taxes.map((tax) => <article key={tax.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-semibold text-[var(--oh-text)]">{tax.name}</h2>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-blue-800">{formatRate(tax)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3">
                <div><p className="text-xs font-medium text-[var(--oh-muted)]">Calculation</p><p className="mt-1 text-sm text-[var(--oh-text-secondary)]">{tax.price_include ? "Included in price" : "Added to price"} · Sales</p></div>
                <div><p className="text-xs font-medium text-[var(--oh-muted)]">Company</p><p className="mt-1 break-words text-sm text-[var(--oh-text-secondary)]">{Array.isArray(tax.company_id) ? tax.company_id[1] : "Shared"}</p></div>
              </div>
            </article>)}
          </div>
          <div className="hidden overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white xl:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th scope="col" className="px-4 py-3">Tax</th><th scope="col" className="px-4 py-3">Rate</th><th scope="col" className="px-4 py-3">Calculation</th><th scope="col" className="px-4 py-3">Company</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {taxes.map((tax) => <tr key={tax.id} className="hover:bg-sky-50/40"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{tax.name}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{formatRate(tax)}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{tax.price_include ? "Included in price" : "Added to price"} · Sales</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{Array.isArray(tax.company_id) ? tax.company_id[1] : "Shared"}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
