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
    <AdminPageLayout
      title="Roles & Permissions"
      subtitle="Define access levels for your team"
      count={roles.length}
      countLabel="Roles"
      actions={
        <AdminPrimaryButton onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> New
        </AdminPrimaryButton>
      }
    >
      <AsyncState loading={loading} error={error} empty={roles.length === 0}>
        <ListTable
          columns={[
            { label: "Role" },
            { label: "Description" },
            { label: "Users", width: "w-[120px]" },
            { label: "Actions", align: "center", width: "w-[200px]" },
          ]}
          rows={roles.map((r) => [
            r.name,
            <span key="d" className="text-[var(--oh-muted)]">—</span>,
            "—",
            <RowActions key="a" justify="center" onEdit={() => setEditing(r)} onDelete={() => remove(r.id)} />,
          ])}
        />
      </AsyncState>

      {creating && (
        <EntityFormModal title="Add Role" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Role" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </AdminPageLayout>
  );
}
