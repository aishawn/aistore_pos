"use client";
import { useCallback, useEffect, useState } from "react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";
import { loadStoreCompanyProfile } from "@/lib/store-company-settings";

export default function DateTimeSettingsClient() {
 const [data, setData] = useState<Awaited<ReturnType<typeof loadStoreCompanyProfile>> | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);
 const load = useCallback(async () => {
  setLoading(true); setError(null);
  try {
    const result = await loadStoreCompanyProfile();
    setData(result);
  }
  catch { setError("Could not load regional settings. Retry to read the current store configuration."); }
  finally { setLoading(false); }
 }, []);
 useEffect(() => { void load(); }, [load]);
 return <CompanySettingsScaffold subSectionTitle="Regional settings" activeHref="/settings/company/date-time" showSearch={false} showSave={false}><section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Locations &amp; currency</h2><button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-4 text-sm font-medium disabled:opacity-50">{loading ? "Loading…" : "Refresh"}</button></div>{error && <p role="alert" className="mt-4 text-sm text-[var(--brand-danger)]">{error}</p>}{loading ? <p role="status" className="mt-4 text-sm text-[var(--oh-muted)]">Loading regional settings…</p> : data && <dl className="mt-5 grid gap-5 sm:grid-cols-2">{[["Country", data.country || "Not configured"], ["State", data.state || "Not configured"], ["Business timezone", data.timezone || "Not available"], ["Base currency", data.currency || "Not configured"]].map(([label, value]) => <div key={label}><dt className="text-sm text-[var(--oh-muted)]">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>}<p className="mt-5 text-sm leading-6 text-[var(--oh-muted)]">Read-only company region from Orithos store settings. The business timezone follows the configured store region, using the same rules as sales and reports.</p></section></CompanySettingsScaffold>;
}
