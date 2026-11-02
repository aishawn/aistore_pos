"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Building2, LoaderCircle, Save } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";
import { api, ApiError } from "@/lib/api";

type Company = { id: number; name?: string; currency_id?: [number, string] | false; vat?: string | false; tz?: string };
const HREF = "/settings/company/general";

export default function GeneralCompanySettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [name, setName] = useState("");
  const [vat, setVat] = useState("");
  const [tz, setTz] = useState("Australia/Adelaide");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { const data = await api.get<Company>("/api/odoo/company"); setCompany(data); setName(data.name || ""); setVat(typeof data.vat === "string" ? data.vat : ""); setTz(data.tz || "Australia/Adelaide"); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not load company details."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null); setNotice(null); try { await api.patch("/api/odoo/company", { name, vat, tz, currency: "AUD" }); await load(); setNotice("Company details saved."); } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not save company details."); } finally { setBusy(false); } }

  return <CompanySettingsScaffold subSectionTitle="Company details" activeHref={HREF} showSearch={false} showSave={false}>
    <div className="mx-auto w-full max-w-3xl">
      <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-info-tint)] text-[var(--oh-primary)]"><Building2 size={20} /></span><div><h2 className="font-semibold text-[var(--oh-text)]">Company profile</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">These details are saved to the company linked to this store.</p></div></div>
      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}<button type="button" onClick={() => void load()} className="ml-auto font-semibold underline">Retry</button></div>}
      {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {loading ? <p role="status" className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Loading company details…</p> : <form onSubmit={save} className="mt-6 grid gap-5"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Legal company name<input required value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base outline-none focus:border-[var(--oh-primary)]" /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">ABN<span className="font-normal text-[var(--oh-muted)]">Optional · used on invoices and receipts</span><input value={vat} onChange={(e) => setVat(e.target.value)} maxLength={32} className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base outline-none focus:border-[var(--oh-primary)]" /></label><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Business timezone<select value={tz} onChange={(e) => setTz(e.target.value)} className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base"><option>Australia/Adelaide</option><option>Australia/Sydney</option><option>Australia/Melbourne</option><option>Australia/Brisbane</option><option>Australia/Perth</option><option>Australia/Darwin</option></select></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Base currency<span className="font-normal text-[var(--oh-muted)]">Multi-currency is not enabled for this store.</span><input value="AUD · Australian dollar" readOnly className="h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base text-[var(--oh-muted)]" /></label></div><div className="flex justify-end border-t border-[var(--oh-border)] pt-4"><button type="submit" disabled={busy || !company} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-50"><Save size={16} />{busy ? "Saving…" : "Save company details"}</button></div></form>}
      </section>
    </div>
  </CompanySettingsScaffold>;
}
