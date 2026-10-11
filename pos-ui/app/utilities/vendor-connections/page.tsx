"use client";

import { useState } from "react";
import { AdminPageLayout, AdminOutlineButton } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { PlusIcon, CableIcon } from "@/components/icons";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";

interface VendorConnection {
  id: string;
  name: string;
  senderCode: string;
  customerId: string;
}

const BASE = "/api/vendor-connections";
const FIELDS: FormField[] = [{ name: "name", label: "Name", type: "text" }];
const body = (v: FormValues) => ({ name: v.name });

export default function VendorConnectionsPage() {
  const { data, loading, error, reload } = useApi<VendorConnection[]>(BASE);
  const vendors = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<VendorConnection | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this item?")) return;
    await api.del(`${BASE}/${id}`);
    reload();
  }

  return (
    <AdminPageLayout
      title="Vendor Connections"
      subtitle="Manage external vendor integrations"
      count={vendors.length}
      actions={
        <AdminOutlineButton onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> New Connection
        </AdminOutlineButton>
      }
    >
      <AsyncState loading={loading} error={error} empty={vendors.length === 0}>
        <ListTable
          columns={[
            { label: "Vendor" },
            { label: "Status", width: "w-[200px]" },
            { label: "Actions", align: "right", width: "w-[300px]" },
          ]}
          rows={vendors.map((v) => [
            <span key="n" className="flex items-center gap-2"><CableIcon size={18} /> {v.name ?? ""}</span>,
            <span key="s" className="text-[var(--oh-success)]">Connected</span>,
            <RowActions key="a" onEdit={() => setEditing(v)} onDelete={() => remove(v.id)} />,
          ])}
        />
      </AsyncState>

      {creating && (
        <EntityFormModal title="Add Connection" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (val) => { await api.post(BASE, body(val)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Connection" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (val) => { await api.put(`${BASE}/${editing.id}`, body(val)); reload(); }} />
      )}
    </AdminPageLayout>
  );
}
