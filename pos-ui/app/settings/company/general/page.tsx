"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadStoreCompanyProfile, saveStoreCompanyProfile, type StoreCompanyProfile } from "@/lib/store-company-settings";

type FormState = { name: string; vat: string; street: string; city: string; zip: string; phone: string; email: string };
const EMPTY: FormState = { name: "", vat: "", street: "", city: "", zip: "", phone: "", email: "" };
const HREF = "/settings/company/general";

export default function GeneralCompanySettingsPage() {
  const { ready, hasPermission } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [company, setCompany] = useState<StoreCompanyProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saved, setSaved] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const data = await loadStoreCompanyProfile();
      const next = { name: data.name || "", vat: data.vat, street: data.street, city: data.city, zip: data.zip, phone: data.phone, email: data.email };
      setCompany(data); setForm(next); setSaved(next); return true;
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : "Could not load company details."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(field: keyof FormState, value: string) { setForm((current) => ({ ...current, [field]: value })); setNotice(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!dirty || !canEdit) return;
    setBusy(true); setError(null); setNotice(null);
    try { await saveStoreCompanyProfile(form); if (await load()) setNotice("Company details saved."); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Could not save company details. Your changes are still here."); }
    finally { setBusy(false); }
  }
  const inputClass = "h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base outline-none transition focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20";
  return <CompanySettingsScaffold subSectionTitle="Company details" activeHref={HREF} showSearch={false} showSave={false}>
    <div className="w-full">
      <div className="mb-5 flex items-start justify-between gap-4"><p className="text-sm leading-6 text-[var(--oh-muted)]">Keep legal, contact and regional details accurate for receipts, reports and AI explanations.</p>{dirty && <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Unsaved changes</span>}</div>
      {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload company details?")) void load(); }} disabled={loading || busy} className="min-h-10 shrink-0 rounded-md px-2 font-semibold underline disabled:opacity-50">Retry</button></div>}
      {ready && !canEdit && <p className="mb-5 text-sm text-[var(--oh-muted)]">Company details are read-only for your account. Contact a store administrator to make changes.</p>}
      {notice && <p role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircle2 size={17} />{notice}</p>}
      {loading ? <div role="status" aria-busy="true" className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-8 text-sm text-[var(--oh-muted)]"><LoaderCircle size={17} className="mr-2 inline animate-spin" />Loading company details…</div> : company ? <form onSubmit={save} className="grid gap-5">
        <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--brand-info-tint)] text-[var(--oh-primary)]"><Building2 size={20} /></span><div><h2 className="font-semibold text-[var(--oh-text)]">Company identity</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Legal details used on receipts, invoices and reports.</p></div></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)] sm:col-span-2">Legal company name<span className="font-normal text-[var(--oh-muted)]">Required</span><input required value={form.name} readOnly={!canEdit || busy} onChange={(e) => update("name", e.target.value)} maxLength={160} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">ABN<span className="font-normal text-[var(--oh-muted)]">Optional · used on invoices and receipts</span><input value={form.vat} readOnly={!canEdit || busy} onChange={(e) => update("vat", e.target.value)} maxLength={32} inputMode="numeric" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Base currency<span className="font-normal text-[var(--oh-muted)]">Read from Orithos store settings.</span><input value={company.currency || "Not configured"} readOnly className={`${inputClass} text-[var(--oh-muted)]`} /></label></div></section>
        <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><h2 className="font-semibold text-[var(--oh-text)]">Contact details</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Shown to customers where supported by receipt and invoice templates.</p><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)] sm:col-span-2">Street address<input value={form.street} readOnly={!canEdit || busy} onChange={(e) => update("street", e.target.value)} maxLength={160} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">City<input value={form.city} readOnly={!canEdit || busy} onChange={(e) => update("city", e.target.value)} maxLength={80} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Postcode<input value={form.zip} readOnly={!canEdit || busy} onChange={(e) => update("zip", e.target.value)} maxLength={16} inputMode="numeric" className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone<input type="tel" value={form.phone} readOnly={!canEdit || busy} onChange={(e) => update("phone", e.target.value)} maxLength={40} className={inputClass} /></label><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email<input type="email" value={form.email} readOnly={!canEdit || busy} onChange={(e) => update("email", e.target.value)} maxLength={160} className={inputClass} /></label></div></section>
        <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6"><h2 className="font-semibold text-[var(--oh-text)]">Regional settings</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Timezone affects new sales, reports, receipts and AI date explanations. Existing timestamps are preserved.</p><div className="mt-5 max-w-md"><label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Business timezone<span className="font-normal text-[var(--oh-muted)]">Derived from the company address, using the same rules as sales and reports.</span><input value={company.timezone || "Not available"} readOnly className={`${inputClass} text-[var(--oh-muted)]`} /></label></div></section>
        <div className="flex justify-end border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/95 py-4 backdrop-blur"><button type="submit" disabled={busy || !dirty || !canEdit} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} />{busy ? "Saving…" : "Save changes"}</button></div>
      </form> : <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-8 text-sm text-[var(--oh-muted)]">Company details are unavailable. Retry to load the store profile.</div>}
    </div>
  </CompanySettingsScaffold>;
}
