"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { DevicesSettingsTabs } from "@/components/admin/SetupHubTabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function HardwareSettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [value, setValue] = useState('{"printer":"","cashDrawer":"","scanner":"browser-keyboard"}');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<Record<string, { value?: string }>>("/api/settings/company")
      .then((bundle) => {
        const raw = bundle["company.hardware_json"]?.value;
        if (raw) setValue(raw);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Load failed"));
  }, []);

  async function save() {
    if (!canEdit) return;
    try {
      JSON.parse(value);
      await api.put("/api/settings/company", { "company.hardware_json": value });
      setNotice("Hardware preferences saved in Orithos.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  return (
    <AdminPageLayout
      title="Hardware"
      subtitle="Printer, cash drawer and scanner preferences"
      toolbar={<DevicesSettingsTabs activeHref="/settings/hardware" />}
    >
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <p className="mb-3 text-sm text-[var(--oh-muted)]">
        Device pairing providers can be wired later. Preferences persist in Orithos and are not overwritten by daily Shopfront sync.
      </p>
      <textarea
        className="min-h-48 w-full rounded-lg border border-[var(--oh-border)] p-3 font-mono text-sm"
        value={value}
        readOnly={!canEdit}
        onChange={(e) => setValue(e.target.value)}
      />
      {canEdit && (
        <button type="button" onClick={() => void save()} className="mt-4 rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">
          Save hardware preferences
        </button>
      )}
    </AdminPageLayout>
  );
}
