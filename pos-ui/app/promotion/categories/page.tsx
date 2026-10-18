"use client";

import { useState } from "react";
import { RefreshCw, Tag } from "lucide-react";
import { AdminPageLayout, AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
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
  const [deleting, setDeleting] = useState<PromotionCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api.del(`${BASE}/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not delete this category.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Promotion Categories"
      subtitle="Group related promotions for easier management"
      count={loading || error ? undefined : categories.length}
      countLabel="Categories"
      actions={
        <AdminPrimaryButton className="min-h-11" onClick={() => setCreating(true)}>
          <PlusIcon size={16} /> Add Category
        </AdminPrimaryButton>
      }
    >
      {actionError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</p>}

      {loading ? (
        <div role="status" aria-label="Loading promotion categories" className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
          <div className="hidden h-12 animate-pulse bg-[var(--oh-surface)] md:block" />
          <div className="divide-y divide-[var(--oh-border)]">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 md:grid-cols-2">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-surface)] md:justify-self-end" />
            </div>)}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"><RefreshCw size={15} /> Try again</button>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)]"><Tag size={19} aria-hidden="true" /></span>
          <h2 className="mt-3 text-base font-semibold text-[var(--oh-text)]">No promotion categories yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">Create a category to organise related promotions.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-[var(--oh-border)] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th scope="col" className="px-4 py-3">Category</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)] bg-white">
                {categories.map((category) => (
                  <tr key={category.id} className="transition-colors hover:bg-slate-50/70">
                    <th scope="row" className="px-4 py-3.5 font-medium text-[var(--oh-text)]">{category.name}</th>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(category)} className="min-h-11 min-w-11 rounded-md px-3 font-medium text-[var(--oh-primary)] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">Edit</button>
                        <button type="button" onClick={() => { setActionError(null); setDeleting(category); }} className="min-h-11 min-w-11 rounded-md px-3 font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {categories.map((category) => (
              <li key={category.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)]"><Tag size={18} aria-hidden="true" /></span>
                  <h2 className="min-w-0 flex-1 pt-1 text-sm font-semibold text-[var(--oh-text)]">{category.name}</h2>
                </div>
                <div className="mt-3 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-3">
                  <button type="button" onClick={() => setEditing(category)} className="min-h-11 min-w-11 rounded-md px-3 text-sm font-medium text-[var(--oh-primary)] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">Edit</button>
                  <button type="button" onClick={() => { setActionError(null); setDeleting(category); }} className="min-h-11 min-w-11 rounded-md px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <EntityFormModal title="Add Category" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post(BASE, body(v)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Category" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (v) => { await api.put(`${BASE}/${editing.id}`, body(v)); reload(); }} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete promotion category"
        message={deleting ? `Delete “${deleting.name}”?` : ""}
        confirmLabel="Delete category"
        busy={deleteBusy}
        error={actionError}
        onConfirm={() => void remove()}
        onCancel={() => { if (!deleteBusy) setDeleting(null); }}
      />
    </AdminPageLayout>
  );
}
