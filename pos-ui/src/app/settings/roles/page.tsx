"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";

interface Role {
  id: string;
  name: string;
}

const BASE = "/api/roles";
const FIELDS: FormField[] = [{ name: "name", label: "Name", type: "text" }];
const body = (v: FormValues) => ({ name: v.name });

export default function RolesPage() {
  const { data, loading, error, reload } = useApi<Role[]>(BASE);
  const roles = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this item?")) return;
    await api.del(`${BASE}/${id}`);
    reload();
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Roles &amp; Permissions</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={18} /> New</button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={roles.length === 0}>
          <ListTable
            columns={[{ label: "Role" }, { label: "Description" }, { label: "Users", width: "w-[120px]" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={roles.map((r) => [r.name, <span key="d" className="text-neutral-600">—</span>, "—", <RowActions key="a" onEdit={() => setEditing(r)} onDelete={() => remove(r.id)} />])}
          />
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal title="Add Role" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Role" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </div>
  );
}
