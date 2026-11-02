"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info, RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";
import { getOdooSession, searchOdooRecords } from "@/lib/odoo-api";

type OdooOutlet = {
  id: number;
  name: string;
  currency_id: [number, string] | false;
};

type OdooRegister = {
  id: number;
  name: string;
  company_id: [number, string] | false;
  current_session_id: [number, string] | false;
  payment_method_ids: number[];
  available_pricelist_ids: number[];
};

export default function RegistersOutletsPage() {
  const [outlets, setOutlets] = useState<OdooOutlet[]>([]);
  const [registers, setRegisters] = useState<OdooRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getOdooSession();
        if (!session) throw new Error("Connect your Orithos staff account to view live stores and registers.");
        const [outletResult, registerResult] = await Promise.all([
          searchOdooRecords<OdooOutlet>("outlets", { limit: 100 }),
          searchOdooRecords<OdooRegister>("registers", { limit: 100 }),
        ]);
        if (active) {
          setOutlets(outletResult.items);
          setRegisters(registerResult.items);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Orithos stores and registers.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [retryKey]);

  return (
    <AdminPageLayout
      title="Registers & Outlets"
      subtitle="Stores and POS registers assigned to your Orithos account"
      count={loading || error ? undefined : outlets.length + registers.length}
      countLabel="Stores + registers"
      fullBleed
      actions={
        <AdminSecondaryButton onClick={() => setRetryKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </AdminSecondaryButton>
      }
      toolbar={<StoreSettingsTabs activeHref="/settings/registers-outlets" />}
    >
      <section aria-label="Store and register source" className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <Info size={18} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" />
        <div><p className="font-semibold text-[var(--oh-text)]">Live from Orithos <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[var(--oh-muted)]">Read only</span></p>
          <p className="mt-1">Create and configure companies and POS registers in Orithos. These lists never write to Classic MySQL.</p></div>
      </section>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>{error}</span>
          <div className="flex flex-wrap items-center gap-2">
<button type="button" onClick={() => setRetryKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : undefined} /> {loading ? "Retrying…" : "Retry"}</button>
            <Link className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)]" href="/settings/account?tab=connection">View connection status</Link>
          </div>
        </div>
      ) : loading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading Orithos stores and registers" className="grid gap-5">
          {Array.from({ length: 2 }, (_, section) => <section key={section} className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
            <div className="h-5 w-44 animate-pulse rounded bg-[var(--oh-border)]" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-[var(--oh-surface)]" />)}
            </div>
          </section>)}
        </div>
      ) : (
        <div className="grid gap-5">
          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--oh-text)]">Stores / companies</h2>
            {outlets.length ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                  {outlets.map((outlet) => <article key={outlet.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4">
                    <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold text-[var(--oh-text)]">{outlet.name}</h3><span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">{Array.isArray(outlet.currency_id) ? outlet.currency_id[1] : "No currency"}</span></div>
                    <p className="mt-2 text-xs text-[var(--oh-muted)]">Orithos company</p>
                  </article>)}
                </div>
                <div className="hidden overflow-hidden rounded-lg border border-[var(--oh-border)] xl:block">
            <table aria-label="Orithos stores and registers" className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3">Store</th><th scope="col" className="px-4 py-3">Currency</th></tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">{outlets.map((outlet) => <tr key={outlet.id} className="hover:bg-sky-50/40"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{outlet.name}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{Array.isArray(outlet.currency_id) ? outlet.currency_id[1] : "—"}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No Orithos companies are available to this account.</p>
            )}
          </section>

          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--oh-text)]">POS registers</h2>
            {registers.length ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                  {registers.map((register) => <article key={register.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4">
                    <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-semibold text-[var(--oh-text)]">{register.name}</h3><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${Array.isArray(register.current_session_id) ? "bg-emerald-50 text-emerald-800" : "bg-[var(--oh-surface)] text-[var(--oh-muted)]"}`}>{Array.isArray(register.current_session_id) ? "Open" : "No open session"}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3"><div><p className="text-xs font-medium text-[var(--oh-muted)]">Store</p><p className="mt-1 break-words text-sm text-[var(--oh-text-secondary)]">{Array.isArray(register.company_id) ? register.company_id[1] : "—"}</p></div><div><p className="text-xs font-medium text-[var(--oh-muted)]">Payment methods</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text-secondary)]">{register.payment_method_ids.length}</p></div></div>
                    {Array.isArray(register.current_session_id) && <p className="mt-3 break-words rounded-md bg-[var(--oh-surface)] px-3 py-2 text-xs text-[var(--oh-text-secondary)]">Session · {register.current_session_id[1]}</p>}
                  </article>)}
                </div>
                <div className="hidden overflow-hidden rounded-lg border border-[var(--oh-border)] xl:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3">Register</th><th scope="col" className="px-4 py-3">Store</th><th scope="col" className="px-4 py-3">Current session</th><th scope="col" className="px-4 py-3 text-right">Payment methods</th></tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">{registers.map((register) => <tr key={register.id} className="hover:bg-sky-50/40"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{register.name}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{Array.isArray(register.company_id) ? register.company_id[1] : "—"}</td><td className="px-4 py-3 text-[var(--oh-text-secondary)]">{Array.isArray(register.current_session_id) ? register.current_session_id[1] : "No current session"}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{register.payment_method_ids.length}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No Orithos POS registers are available to this account.</p>
            )}
          </section>
        </div>
      )}
    </AdminPageLayout>
  );
}
