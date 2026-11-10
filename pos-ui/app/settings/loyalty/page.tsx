"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoyaltySettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [earn, setEarn] = useState("1");
  const [redeem, setRedeem] = useState("100");
  const [enabled, setEnabled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void api.get<{ value?: string }>("/api/settings", { scopeType: "vendor" }).then((rows) => {
      const list = Array.isArray(rows) ? rows : [];
      const loyalty = list.find((row: { name?: string }) => row.name === "loyalty");
      if (!loyalty?.value) return;
      try {
        const parsed = JSON.parse(loyalty.value) as { enabled?: boolean; earnRate?: string; redeemRate?: string };
        setEnabled(Boolean(parsed.enabled));
        if (parsed.earnRate) setEarn(String(parsed.earnRate));
        if (parsed.redeemRate) setRedeem(String(parsed.redeemRate));
      } catch {
        /* ignore */
      }
    }).catch(() => undefined);
  }, []);

  async function save() {
    if (!canEdit) return;
    const payload = JSON.stringify({ enabled, earnRate: earn, redeemRate: redeem });
    await api.put("/api/settings/loyalty", { loyalty: payload });
    setNotice("Loyalty settings saved.");
  }

  return (
    <AdminPageLayout title="Loyalty" subtitle="Points earn and redeem rates for Orithos">
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <div className="grid max-w-lg gap-4 rounded-xl border border-[var(--oh-border)] bg-white p-5">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
          Enable loyalty
        </label>
        <label className="grid gap-1 text-sm font-medium">Earn rate
          <input className="h-10 rounded-lg border px-3" value={earn} disabled={!canEdit} onChange={(e) => setEarn(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Redeem rate
          <input className="h-10 rounded-lg border px-3" value={redeem} disabled={!canEdit} onChange={(e) => setRedeem(e.target.value)} />
        </label>
        {canEdit && (
          <button type="button" onClick={() => void save()} className="rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">Save</button>
        )}
      </div>
    </AdminPageLayout>
  );
}
