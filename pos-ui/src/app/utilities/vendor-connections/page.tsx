"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { PlusIcon, CableIcon } from "@/components/icons";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

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
        <h1 className="flex items-center gap-3 text-[34px] font-bold text-black"><CableIcon size={30} /> Vendor Connections</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={18} /> New Connection</button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={vendors.length === 0} onRetry={reload}>
          <ListTable
            columns={[{ label: "Vendor" }, { label: "Status", width: "w-[200px]" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={vendors.map((v) => [v.name ?? "", <span key="s" style={{ color: "#3cb44b" }}>Connected</span>, <RowActions key="a" onEdit={() => setEditing(v)} onDelete={() => setDeletingId(v.id)} />])}
          />
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal title="Add Connection" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (val) => { await api.post(BASE, body(val)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Connection" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (val) => { await api.put(`${BASE}/${editing.id}`, body(val)); reload(); }} />
      )}
      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Vendor Connection"
        message="Are you sure you want to delete this vendor connection? This action cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => { if (!deleteBusy) setDeletingId(null); }}
      />
    </div>
  );
}
