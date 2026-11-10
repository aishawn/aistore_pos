"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type RegisterRow = { id: number; name: string; surcharging?: string | null };

export default function SurchargingSettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [registers, setRegisters] = useState<RegisterRow[]>([]);
  const [selected, setSelected] = useState<number | "">("");
  const [json, setJson] = useState('{"enabled":false,"percent":0}');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.get<RegisterRow[]>("/api/registers").then((rows) => {
      setRegisters(Array.isArray(rows) ? rows : []);
      if (rows?.[0]) {
        setSelected(rows[0].id);
        setJson(rows[0].surcharging || '{"enabled":false,"percent":0}');
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load registers"));
  }, []);

  useEffect(() => {
    const row = registers.find((r) => r.id === selected);
    if (row) setJson(row.surcharging || '{"enabled":false,"percent":0}');
  }, [selected, registers]);

  async function save() {
    if (!canEdit || selected === "") return;
    try {
      JSON.parse(json);
      await api.put(`/api/registers/${selected}/surcharging`, { surcharging: json });
      setNotice("Surcharging saved for register.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    }
  }

  return (
    <AdminPageLayout title="Surcharging" subtitle="Per-register surcharge rules stored in Orithos">
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-3 text-sm text-emerald-800">{notice}</p>}
      <label className="grid max-w-md gap-1 text-sm font-medium">Register
        <select className="h-10 rounded-lg border px-3" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
          {registers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <textarea className="mt-4 min-h-40 w-full max-w-2xl rounded-lg border p-3 font-mono text-sm" value={json} readOnly={!canEdit} onChange={(e) => setJson(e.target.value)} />
      {canEdit && (
        <button type="button" onClick={() => void save()} className="mt-4 rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white">Save</button>
      )}
    </AdminPageLayout>
  );
}
