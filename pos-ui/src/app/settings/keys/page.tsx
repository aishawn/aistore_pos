"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";

interface SaleKeysSet {
  id: number;
  name: string;
  saleKeys?: string | null;
}

const BASE = "/api/sale-keys";
const FIELDS: FormField[] = [{ name: "name", label: "Name", type: "text", required: true }];
const body = (v: FormValues) => ({ name: v.name, saleKeys: null });

export default function SaleKeysPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useApi<SaleKeysSet[]>(BASE);
  const sets = data ?? [];
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function confirmRemove() {
    if (deletingId === null) return;
    setDeleteBusy(true);
    try {
      await api.del(`${BASE}/${deletingId}`);
      setDeletingId(null);
      reload();
    } finally {
      setDeleteBusy(false);
    }
  }

  async function clone(id: number) {
    await api.post(`${BASE}/${id}/clone`);
    reload();
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Sales Keys</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-md bg-[#3cb44b] px-5 py-2.5 text-[16px] font-semibold text-white transition-colors hover:bg-[#35a042]"
        >
          <PlusIcon size={18} /> New
        </button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={sets.length === 0} emptyText="No sale keys sets found.">
          <div className="overflow-hidden rounded-sm border border-neutral-300">
            <div className="grid grid-cols-[1fr_320px] border-b border-neutral-300 bg-white">
              <div className="border-r border-neutral-300 px-4 py-3 text-center text-[16px] font-semibold text-black">
                Name
              </div>
              <div className="px-4 py-3 text-center text-[16px] font-semibold text-black">Actions</div>
            </div>
            {sets.map((set, index) => (
              <div
                key={set.id}
                className={`grid grid-cols-[1fr_320px] ${index < sets.length - 1 ? "border-b border-neutral-300" : ""}`}
              >
                <div className="border-r border-neutral-300 px-4 py-3 text-[16px] text-black">{set.name}</div>
                <div className="flex items-center px-4 py-3">
                  <RowActions
                    clone
                    onEdit={() => router.push(`/settings/keys/${set.id}/edit`)}
                    onClone={() => clone(set.id)}
                    onDelete={() => setDeletingId(set.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal
          title="New Sales Keys"
          fields={FIELDS}
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const created = await api.post<SaleKeysSet>(BASE, body(v));
            reload();
            if (created?.id) {
              router.push(`/settings/keys/${created.id}/edit`);
            }
          }}
        />
      )}
      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Sales Keys"
        message="Are you sure you want to delete this sales keys set? This action cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => { if (!deleteBusy) setDeletingId(null); }}
      />
    </div>
  );
}
