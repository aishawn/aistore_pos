"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { AsyncState } from "@/components/admin/AsyncState";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";

interface PromotionCategory {
  id: string;
  name: string;
}

const BASE = "/api/promotion-categories";
const FIELDS: FormField[] = [{ name: "name", label: "Name", type: "text" }];
const body = (v: FormValues) => ({ name: v.name });

export default function PromotionCategoriesPage() {
  const { data, loading, error, reload } = useApi<PromotionCategory[]>(BASE);
  const categories = data ?? [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PromotionCategory | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this item?")) return;
    await api.del(`${BASE}/${id}`);
    reload();
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Promotion Categories</h1>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-full bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white"><PlusIcon size={18} /> Add Category</button>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={categories.length === 0}>
          <ListTable
            columns={[{ label: "Category" }, { label: "Promotions", width: "w-[160px]" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={categories.map((c) => [c.name, "—", <RowActions key="a" onEdit={() => setEditing(c)} onDelete={() => remove(c.id)} />])}
          />
        </AsyncState>
      </div>

      {creating && (
        <EntityFormModal title="Add Category" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Category" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </div>
  );
}
