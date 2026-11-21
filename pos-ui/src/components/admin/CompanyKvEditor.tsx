"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useStoreDateTime } from "@/lib/store-date-time-context";
import { isCompanySettingRuntimeSupported, type CompanyField, type CompanySection } from "@/lib/company-settings-catalog";
import { formatCompanySetting, normalizeCompanySetting, serializeCompanySetting, validateCompanySetting } from "@/lib/company-settings-form";

type SettingView = { name: string; value: string; datatype?: string; orithosOwned?: boolean; persisted?: boolean };

function asBool(value: string | undefined) {
  return value === "true" || value === "1" || value === "yes";
}

export function CompanyKvEditor({ section }: { section: CompanySection }) {
  const { ready, hasPermission } = useAuth();
  const { refresh: refreshStoreDateTime } = useStoreDateTime();
  const canEdit = ready && hasPermission("settings.store");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const bundle = await api.get<Record<string, SettingView>>("/api/settings/company");
      const next: Record<string, string> = {};
      const baseline: Record<string, string> = {};
      for (const field of section.fields) {
        const raw = bundle[field.key]?.value ?? "";
        const normalized = normalizeCompanySetting(field, raw);
        next[field.key] = field.type === "string-list" ? formatCompanySetting(field, normalized) : normalized;
        baseline[field.key] = field.type === "string-list" ? formatCompanySetting(field, raw) : raw;
      }
      setValues(next);
      setSaved(baseline);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load company settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [section.href]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || !canEdit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      for (const field of section.fields) {
        const message = validateCompanySetting(field, values[field.key] ?? "");
        if (message) {
          setError(message);
          setBusy(false);
          return;
        }
      }
      const payload: Record<string, string> = {};
      for (const field of section.fields) {
        if (values[field.key] !== saved[field.key]) {
          const draft = values[field.key] ?? "";
          payload[field.key] = field.type === "string-list" ? serializeCompanySetting(field, draft) : draft;
        }
      }
      await api.put("/api/settings/company", payload);
      if (["company.timezone", "company.date_format", "company.time_format"].some((key) => key in payload)) {
        await refreshStoreDateTime();
      }
      await load();
      setNotice("Settings saved to Orithos. Scheduled import will not overwrite these values.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  function update(field: CompanyField, value: string) {
    setValues((current) => ({ ...current, [field.key]: value }));
    setNotice(null);
  }

  const inputClass =
    "h-11 w-full max-w-md rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base outline-none transition focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <CompanySettingsScaffold subSectionTitle={section.title} activeHref={section.href} showSearch={false} showSave={false}>
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-sm leading-6 text-[var(--oh-muted)]">
            Orithos is the source of truth for these settings. Import from integrations only fills empty values.
          </p>
          {dirty && <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Unsaved changes</span>}
        </div>
        {error && (
          <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => void load()} className="min-h-10 shrink-0 rounded-md px-2 font-semibold underline">Retry</button>
          </div>
        )}
        {ready && !canEdit && <p className="mb-5 text-sm text-[var(--oh-muted)]">Read-only for your account.</p>}
        {notice && (
          <p role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 size={17} />
            {notice}
          </p>
        )}
        {loading ? (
          <div role="status" className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-8 text-sm text-[var(--oh-muted)]">
            <LoaderCircle size={17} className="mr-2 inline animate-spin" />
            Loading…
          </div>
        ) : (
          <form onSubmit={save} className="grid gap-1 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
            {section.fields.map((field) => (
              <div key={field.key} className="border-b border-[var(--oh-border)] py-4 last:border-b-0">
                {!isCompanySettingRuntimeSupported(field.key) && (
                  <p className="mb-2 text-xs font-medium text-[var(--oh-muted)]">
                    Stored only; this setting does not affect Orithos behavior yet.
                  </p>
                )}
                <label className="grid gap-1.5 text-sm font-semibold text-[var(--oh-text)]">
                  {field.label}
                  {field.description && <span className="font-normal text-[var(--oh-muted)]">{field.description}</span>}
                  {field.type === "boolean" ? (
                    <button
                      type="button"
                      disabled={!canEdit || busy || !isCompanySettingRuntimeSupported(field.key)}
                      onClick={() => update(field, asBool(values[field.key]) ? "false" : "true")}
                      className={`mt-2 flex h-7 w-12 items-center rounded-full p-1 disabled:cursor-not-allowed disabled:opacity-60 ${asBool(values[field.key]) ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]"}`}
                      aria-pressed={asBool(values[field.key])}
                    >
                      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
                    </button>
                  ) : field.type === "select" ? (
                    <select
                      className={inputClass}
                      disabled={!canEdit || busy || !isCompanySettingRuntimeSupported(field.key)}
                      value={values[field.key] ?? ""}
                      onChange={(e) => update(field, e.target.value)}
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : field.type === "string-list" ? (
                    <textarea
                      className={`${inputClass} min-h-[7rem] max-w-lg resize-y py-2`}
                      disabled={!canEdit || busy || !isCompanySettingRuntimeSupported(field.key)}
                      value={values[field.key] ?? ""}
                      onChange={(e) => update(field, e.target.value)}
                      placeholder="One reason per line"
                    />
                  ) : (
                    <input
                      className={inputClass}
                      type={field.type === "number" ? "number" : "text"}
                      disabled={!canEdit || busy || !isCompanySettingRuntimeSupported(field.key)}
                      value={values[field.key] ?? ""}
                      onChange={(e) => update(field, e.target.value)}
                    />
                  )}
                </label>
              </div>
            ))}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={busy || !dirty || !canEdit}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Save size={16} />
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </CompanySettingsScaffold>
  );
}
