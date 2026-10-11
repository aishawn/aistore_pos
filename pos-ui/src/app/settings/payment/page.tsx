"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
}

const BASE = "/api/payment-methods";
const FIELDS: FormField[] = [
  { name: "name", label: "Name", type: "text" },
  { name: "type", label: "Type", type: "text" },
];
const body = (v: FormValues) => ({ name: v.name, type: v.type });

export default function PaymentMethodsPage() {
  const { data, loading, error, reload } = useApi<PaymentMethod[]>(BASE);
  const methods = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this item?")) return;
    await api.del(`${BASE}/${id}`);
    reload();
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Payment Methods</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={18} /> New</button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={methods.length === 0}>
          <ListTable
            columns={[{ label: "Name" }, { label: "Type" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={methods.map((m) => [
              m.name,
              m.type ?? "",
              <RowActions key="a" onEdit={() => setEditing(m)} onDelete={() => remove(m.id)} />,
            ])}
          />
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal title="Add Payment Method" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Payment Method" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </div>
  );
}
