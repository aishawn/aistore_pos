"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type EnterpriseState = Record<string, string>;

export default function EnterprisePoliciesPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [state, setState] = useState<EnterpriseState>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setState(await api.get<EnterpriseState>("/api/settings/enterprise"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load enterprise policies");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function bool(key: string) {
    return state[key] === "true" || state[key] === "1";
  }

  async function save() {
    if (!canEdit) return;
    try {
      await api.put("/api/settings/enterprise", state);
      setNotice("Enterprise policies saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  return (
    <AdminPageLayout title="Enterprise Policies" subtitle="Multi-outlet policy controls stored in Orithos">
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid max-w-xl gap-4 rounded-xl border border-[var(--oh-border)] bg-white p-5">
        {[
          ["enterprise.enforce_centralised_pricing", "Enforce centralised pricing"],
          ["enterprise.lock_product_edits_head_office", "Lock product edits to head office"],
          ["enterprise.allow_local_promotions", "Allow local promotions"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm font-medium">
            {label}
            <input
              type="checkbox"
              checked={bool(key)}
              disabled={!canEdit}
              onChange={() => setState((current) => ({ ...current, [key]: bool(key) ? "false" : "true" }))}
            />
          </label>
        ))}
        <label className="grid gap-1 text-sm font-medium">Data sync scope
          <select
            className="h-10 rounded-lg border px-3"
            disabled={!canEdit}
            value={state["enterprise.data_sync_scope"] ?? "ALL_OUTLETS"}
            onChange={(e) => setState((current) => ({ ...current, "enterprise.data_sync_scope": e.target.value }))}
          >
            <option value="ALL_OUTLETS">All Outlets</option>
            <option value="LOCAL_ONLY">Local only</option>
          </select>
        </label>
        {canEdit && (
          <button type="button" onClick={() => void save()} className="rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">Save policies</button>
        )}
      </div>
    </AdminPageLayout>
  );
}
