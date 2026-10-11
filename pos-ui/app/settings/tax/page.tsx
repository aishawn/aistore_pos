"use client";

import { useState } from "react";
import {
  AdminPageLayout,
  AdminPrimaryButton,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";

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

  async function remove(id: string) {
    if (!window.confirm("Delete this item?")) return;
    await api.del(`${BASE}/${id}`);
    reload();
  }

  return (
    <AdminPageLayout
      title="Tax Rates"
      subtitle="Manage sales tax and GST rates"
      count={rates.length}
      countLabel="Rates"
      actions={
        <AdminPrimaryButton onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> New
        </AdminPrimaryButton>
      }
    >
      <AsyncState loading={loading} error={error} empty={rates.length === 0}>
        <ListTable
          columns={[
            { label: "Name" },
            { label: "Rate" },
            { label: "Actions", align: "center", width: "w-[200px]" },
          ]}
          rows={rates.map((r) => [
            r.name,
            `${Number(r.amount)}%`,
            <RowActions key="a" justify="center" onEdit={() => setEditing(r)} onDelete={() => remove(r.id)} />,
          ])}
        />
      </AsyncState>

      {creating && (
        <EntityFormModal title="Add Tax Rate" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Tax Rate" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </AdminPageLayout>
  );
}
