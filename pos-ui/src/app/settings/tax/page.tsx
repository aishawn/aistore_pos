"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

interface TaxRate {
  id: string;
  name: string;
  amount: number;
}

const BASE = "/api/tax-rates";
const FIELDS: FormField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "amount", label: "Rate (%)", type: "number" },
];
const body = (v: FormValues) => ({ name: v.name, amount: Number(v.amount) });

export default function TaxRatesPage() {
  const { data, loading, error, reload } = useApi<TaxRate[]>(BASE);
  const rates = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmRemove() {
    if (!deletingId) return;
    setDeleteBusy(true);
    try {
      await api.del(`${BASE}/${deletingId}`);
      setDeletingId(null);
      reload();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Tax Rates</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={18} /> New</button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={rates.length === 0}>
          <ListTable
            columns={[{ label: "Name" }, { label: "Rate" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={rates.map((r) => [r.name, `${Number(r.amount)}%`, <RowActions key="a" onEdit={() => setEditing(r)} onDelete={() => setDeletingId(r.id)} />])}
          />
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal title="Add Tax Rate" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Tax Rate" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Tax Rate"
        message="Are you sure you want to delete this tax rate? This action cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => { if (!deleteBusy) setDeletingId(null); }}
      />
    </div>
  );
}
