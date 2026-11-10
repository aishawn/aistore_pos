"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type PushState = Record<string, string>;

export default function PushNotificationsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [state, setState] = useState<PushState>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<PushState>("/api/settings/push");
      setState(data ?? {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load push settings");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function bool(key: string) {
    return state[key] === "true" || state[key] === "1";
  }

  function toggle(key: string) {
    setState((current) => ({ ...current, [key]: bool(key) ? "false" : "true" }));
  }

  async function save() {
    if (!canEdit) return;
    try {
      await api.put("/api/settings/push", state);
      setNotice("Push notification preferences saved.");
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  const toggles = [
    { key: "push.low_stock_enabled", label: "Low-stock alerts" },
    { key: "push.end_of_day_enabled", label: "End-of-day summary" },
    { key: "push.refund_enabled", label: "Refund notifications" },
    { key: "push.email_delivery_enabled", label: "Email and push delivery" },
  ];

  return (
    <AdminPageLayout title="Push Notifications" subtitle="Alert preferences stored in Orithos (delivery provider may be no-op until configured)">
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {toggles.map((item) => (
          <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 text-sm font-medium">
            {item.label}
            <input type="checkbox" checked={bool(item.key)} disabled={!canEdit} onChange={() => toggle(item.key)} />
          </label>
        ))}
      </div>
      <label className="mt-4 grid gap-1 text-sm font-medium">Devices JSON
        <textarea
          className="min-h-28 rounded-lg border p-3 font-mono text-sm"
          value={state["push.devices_json"] ?? "[]"}
          readOnly={!canEdit}
          onChange={(e) => setState((current) => ({ ...current, "push.devices_json": e.target.value }))}
        />
      </label>
      <label className="mt-4 grid gap-1 text-sm font-medium">Rules JSON
        <textarea
          className="min-h-28 rounded-lg border p-3 font-mono text-sm"
          value={state["push.rules_json"] ?? "[]"}
          readOnly={!canEdit}
          onChange={(e) => setState((current) => ({ ...current, "push.rules_json": e.target.value }))}
        />
      </label>
      {canEdit && (
        <button type="button" onClick={() => void save()} className="mt-4 rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
    </AdminPageLayout>
  );
}
