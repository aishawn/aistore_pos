"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function PageRulesSettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [value, setValue] = useState("[]");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<Record<string, { value?: string }>>("/api/settings/company")
      .then((bundle) => setValue(bundle["company.page_rules_json"]?.value || "[]"))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Load failed"));
  }, []);

  async function save() {
    if (!canEdit) return;
    try {
      JSON.parse(value);
      await api.put("/api/settings/company", { "company.page_rules_json": value });
      setNotice("Page rules saved.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed — ensure JSON is valid.");
    }
  }

  return (
    <AdminPageLayout title="Page Rules" subtitle="Conditional UI and workflow rules stored in Orithos">
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <textarea
        className="min-h-64 w-full rounded-lg border border-[var(--oh-border)] p-3 font-mono text-sm"
        value={value}
        readOnly={!canEdit}
        onChange={(e) => setValue(e.target.value)}
      />
      {canEdit && (
        <button type="button" onClick={() => void save()} className="mt-4 rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">
          Save rules
        </button>
      )}
    </AdminPageLayout>
  );
}
