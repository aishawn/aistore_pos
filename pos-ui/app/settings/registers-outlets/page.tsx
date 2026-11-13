"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { StoreSettingsTabs } from "@/components/admin/SetupHubTabs";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Outlet = { id: number; name: string; [key: string]: unknown };
type Register = { id: number; name: string; outletId?: number; invoiceNumber?: string; closed?: boolean; [key: string]: unknown };
type PaymentMethod = { id: number; name: string; type: string };

export default function RegistersOutletsPage() {
  const { hasPermission, ready } = useAuth();
  const canEdit = ready && hasPermission("settings.store");
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outletName, setOutletName] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerOutletId, setRegisterOutletId] = useState<number | "">("");
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [editingRegister, setEditingRegister] = useState<Register | null>(null);
  const [paymentEditorRegisterId, setPaymentEditorRegisterId] = useState<number | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodIds, setSelectedPaymentMethodIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [outletRows, registerRows] = await Promise.all([
        api.get<Outlet[]>("/api/outlets"),
        api.get<Register[]>("/api/registers"),
      ]);
      setError(null);
      setOutlets(Array.isArray(outletRows) ? outletRows : []);
      setRegisters(Array.isArray(registerRows) ? registerRows : []);
      if (outletRows?.[0]) setRegisterOutletId((current) => current === "" ? outletRows[0].id : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load registers and outlets");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addOutlet() {
    if (!canEdit || !outletName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/outlets", { name: outletName.trim() });
      setOutletName("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add outlet");
    } finally {
      setSaving(false);
    }
  }

  async function addRegister() {
    if (!canEdit || !registerName.trim() || registerOutletId === "") return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/registers", { name: registerName.trim(), outletId: registerOutletId, closed: false });
      setRegisterName("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add register");
    } finally {
      setSaving(false);
    }
  }

  async function updateOutlet() {
    if (!canEdit || !editingOutlet?.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/outlets/${editingOutlet.id}`, { ...editingOutlet, name: editingOutlet.name.trim() });
      setEditingOutlet(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update outlet");
    } finally {
      setSaving(false);
    }
  }

  async function updateRegister() {
    if (!canEdit || !editingRegister?.name.trim() || !editingRegister.outletId) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/registers/${editingRegister.id}`, {
        ...editingRegister,
        name: editingRegister.name.trim(),
      });
      setEditingRegister(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update register");
    } finally {
      setSaving(false);
    }
  }

  async function editRegisterPayments(registerId: number) {
    setError(null);
    try {
      const [methods, assignedIds] = await Promise.all([
        api.get<PaymentMethod[]>("/api/payment-methods"),
        api.get<number[]>(`/api/registers/${registerId}/payment-methods`),
      ]);
      setPaymentMethods(Array.isArray(methods) ? methods : []);
      setSelectedPaymentMethodIds(Array.isArray(assignedIds) ? assignedIds : []);
      setPaymentEditorRegisterId(registerId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load register payment methods");
    }
  }

  async function saveRegisterPayments(registerId: number) {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/registers/${registerId}/payment-methods`, {
        paymentMethodIds: selectedPaymentMethodIds,
      });
      setPaymentEditorRegisterId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save register payment methods");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPageLayout
      title="Registers & Outlets"
      subtitle="Store locations and POS registers"
      actions={<AdminSecondaryButton onClick={() => void load()}>Refresh</AdminSecondaryButton>}
      toolbar={<StoreSettingsTabs activeHref="/settings/registers-outlets" />}
    >
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4">
          <h2 className="font-semibold">Outlets</h2>
          <ul className="mt-3 divide-y">
            {outlets.map((outlet) => (
              <li key={outlet.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                {editingOutlet?.id === outlet.id ? (
                  <input
                    aria-label={`Outlet name ${outlet.id}`}
                    autoFocus
                    className="h-10 min-w-0 flex-1 rounded-lg border px-3"
                    value={editingOutlet.name}
                    disabled={saving}
                    onChange={(e) => setEditingOutlet({ ...editingOutlet, name: e.target.value })}
                  />
                ) : <span className="min-w-0 flex-1">{outlet.name}</span>}
                {canEdit && (editingOutlet?.id === outlet.id ? (
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => void updateOutlet()} disabled={saving || !editingOutlet.name.trim()} className="font-semibold text-[var(--oh-primary)] disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditingOutlet(null)} disabled={saving} className="text-[var(--oh-muted)]">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setEditingOutlet({ ...outlet })} className="shrink-0 font-semibold text-[var(--oh-primary)]">Edit</button>
                ))}
              </li>
            ))}
            {outlets.length === 0 && <li className="py-6 text-sm text-[var(--oh-muted)]">No outlets yet.</li>}
          </ul>
          {canEdit && (
            <div className="mt-3 flex gap-2">
              <input className="h-10 flex-1 rounded-lg border px-3" value={outletName} onChange={(e) => setOutletName(e.target.value)} placeholder="New outlet name" />
              <button type="button" onClick={() => void addOutlet()} disabled={saving || !outletName.trim()} className="rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">Add</button>
            </div>
          )}
        </section>
        <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4">
          <h2 className="font-semibold">Registers</h2>
          <ul className="mt-3 divide-y">
            {registers.map((register) => (
              <Fragment key={register.id}>
              <li className="flex items-center justify-between gap-2 py-2 text-sm">
                {editingRegister?.id === register.id ? (
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <input
                      aria-label={`Register name ${register.id}`}
                      autoFocus
                      className="h-10 min-w-0 rounded-lg border px-3"
                      value={editingRegister.name}
                      disabled={saving}
                      onChange={(e) => setEditingRegister({ ...editingRegister, name: e.target.value })}
                    />
                    <select
                      aria-label={`Register outlet ${register.id}`}
                      className="h-10 min-w-0 rounded-lg border px-3"
                      value={editingRegister.outletId ?? ""}
                      disabled={saving}
                      onChange={(e) => setEditingRegister({ ...editingRegister, outletId: Number(e.target.value) })}
                    >
                      {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{register.name}</span>
                    <span className="block text-xs text-[var(--oh-muted)]">
                      {outlets.find((outlet) => outlet.id === register.outletId)?.name ?? "Unknown outlet"}
                      {` · ${register.closed ? "Closed" : "Openable"}`}
                    </span>
                  </span>
                )}
                {canEdit && (editingRegister?.id === register.id ? (
                  <span className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => void updateRegister()} disabled={saving || !editingRegister.name.trim() || !editingRegister.outletId} className="font-semibold text-[var(--oh-primary)] disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditingRegister(null)} disabled={saving} className="text-[var(--oh-muted)]">Cancel</button>
                  </span>
                ) : (
                  <span className="flex shrink-0 gap-3">
                    <button type="button" onClick={() => void editRegisterPayments(register.id)} className="font-semibold text-[var(--oh-primary)]">Payments</button>
                    <button type="button" onClick={() => setEditingRegister({ ...register })} className="font-semibold text-[var(--oh-primary)]">Edit</button>
                  </span>
                ))}
              </li>
              {paymentEditorRegisterId === register.id && (
                <li className="grid gap-3 border-b py-3">
                  <h3 className="text-sm font-semibold">Accepted payment methods</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {paymentMethods.map((method) => (
                      <label key={method.id} className="flex min-h-10 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedPaymentMethodIds.includes(method.id)}
                          disabled={!canEdit || saving}
                          onChange={(event) => setSelectedPaymentMethodIds((current) => event.target.checked
                            ? [...current, method.id]
                            : current.filter((id) => id !== method.id))}
                        />
                        <span>{method.name} <span className="text-xs text-[var(--oh-muted)]">{method.type}</span></span>
                      </label>
                    ))}
                    {paymentMethods.length === 0 && <p className="text-sm text-[var(--oh-muted)]">No payment methods configured.</p>}
                  </div>
                  {selectedPaymentMethodIds.length === 0 && (
                    <p role="status" className="text-sm text-amber-700">Select at least one payment method.</p>
                  )}
                  <div className="flex gap-3">
                    {canEdit && <button type="button" onClick={() => void saveRegisterPayments(register.id)} disabled={saving || selectedPaymentMethodIds.length === 0} className="font-semibold text-[var(--oh-primary)] disabled:opacity-50">Save payments</button>}
                    <button type="button" onClick={() => setPaymentEditorRegisterId(null)} disabled={saving} className="text-[var(--oh-muted)]">Cancel</button>
                  </div>
                </li>
              )}
              </Fragment>
            ))}
            {registers.length === 0 && <li className="py-6 text-sm text-[var(--oh-muted)]">No registers yet.</li>}
          </ul>
          {canEdit && (
            <div className="mt-3 grid gap-2">
              <input className="h-10 rounded-lg border px-3" value={registerName} onChange={(e) => setRegisterName(e.target.value)} placeholder="New register name" />
              <select className="h-10 rounded-lg border px-3" value={registerOutletId} onChange={(e) => setRegisterOutletId(Number(e.target.value))}>
                {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
              </select>
              <button type="button" onClick={() => void addRegister()} disabled={saving || !registerName.trim() || registerOutletId === ""} className="rounded-lg bg-[var(--oh-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Add register</button>
            </div>
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
}
