"use client";

import { useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Outlet = { id: number; name: string };
type Register = { id: number; name: string; outletId?: number; invoiceNumber?: string; closed?: boolean };

export default function RegistersOutletsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outletName, setOutletName] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerOutletId, setRegisterOutletId] = useState<number | "">("");

  async function load() {
    setError(null);
    try {
      const [outletRows, registerRows] = await Promise.all([
        api.get<Outlet[]>("/api/outlets"),
        api.get<Register[]>("/api/registers"),
      ]);
      setOutlets(Array.isArray(outletRows) ? outletRows : []);
      setRegisters(Array.isArray(registerRows) ? registerRows : []);
      if (outletRows?.[0] && registerOutletId === "") setRegisterOutletId(outletRows[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load registers and outlets");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addOutlet() {
    if (!canEdit || !outletName.trim()) return;
    await api.post("/api/outlets", { name: outletName.trim(), vendorId: 1 });
    setOutletName("");
    await load();
  }

  async function addRegister() {
    if (!canEdit || !registerName.trim() || registerOutletId === "") return;
    await api.post("/api/registers", { name: registerName.trim(), outletId: registerOutletId, closed: false });
    setRegisterName("");
    await load();
  }

  return (
    <AdminPageLayout
      title="Registers & Outlets"
      subtitle="Store locations and POS registers"
      actions={<AdminSecondaryButton onClick={() => void load()}>Refresh</AdminSecondaryButton>}
      toolbar={<StoreSettingsTabs activeHref="/settings/registers-outlets" />}
    >
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4">
          <h2 className="font-semibold">Outlets</h2>
          <ul className="mt-3 divide-y">
            {outlets.map((outlet) => <li key={outlet.id} className="py-2 text-sm">{outlet.name}</li>)}
            {outlets.length === 0 && <li className="py-6 text-sm text-[var(--oh-muted)]">No outlets yet.</li>}
          </ul>
          {canEdit && (
            <div className="mt-3 flex gap-2">
              <input className="h-10 flex-1 rounded-lg border px-3" value={outletName} onChange={(e) => setOutletName(e.target.value)} placeholder="New outlet name" />
              <button type="button" onClick={() => void addOutlet()} className="rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white">Add</button>
            </div>
          )}
        </section>
        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4">
          <h2 className="font-semibold">Registers</h2>
          <ul className="mt-3 divide-y">
            {registers.map((register) => (
              <li key={register.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{register.name}</span>
                <span className="text-[var(--oh-muted)]">{register.closed ? "Closed" : "Openable"}</span>
              </li>
            ))}
            {registers.length === 0 && <li className="py-6 text-sm text-[var(--oh-muted)]">No registers yet.</li>}
          </ul>
          {canEdit && (
            <div className="mt-3 grid gap-2">
              <input className="h-10 rounded-lg border px-3" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="New register name" />
              <select className="h-10 rounded-lg border px-3" value={registerOutletId} onChange={(e) => setRegisterOutletId(Number(e.target.value))}>
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
              <button type="button" onClick={() => void addRegister()} className="rounded-lg bg-[var(--oh-primary)] px-3 py-2 text-sm font-semibold text-white">Add register</button>
            </div>
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
}
