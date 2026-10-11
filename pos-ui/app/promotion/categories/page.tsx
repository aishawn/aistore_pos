"use client";

import { useState } from "react";
import { AdminPageLayout, AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
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
    <AdminPageLayout
      title="Promotion Categories"
      count={categories.length}
      actions={
        <AdminPrimaryButton onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> Add Category
        </AdminPrimaryButton>
      }
    >
      <AsyncState loading={loading} error={error} empty={categories.length === 0}>
        <ListTable
          columns={[
            { label: "Category" },
            { label: "Promotions", width: "w-[160px]" },
            { label: "Actions", align: "right", width: "w-[300px]" },
          ]}
          rows={categories.map((c) => [
            c.name,
            "—",
            <RowActions key="a" onEdit={() => setEditing(c)} onDelete={() => remove(c.id)} />,
          ])}
        />
      </AsyncState>

      {creating && (
        <EntityFormModal title="Add Category" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Category" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
    </AdminPageLayout>
  );
}
