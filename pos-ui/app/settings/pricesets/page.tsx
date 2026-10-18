"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Layers3, Plus, RefreshCw, Tag } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EntityFormModal, type FormField } from "@/components/admin/EntityFormModal";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";

interface PriceSet {
  id: number | string;
  name: string;
  parentId?: number | string | null;
}

const EMPTY_PRICE_SETS: PriceSet[] = [];

export default function PriceSetsPage() {
  const { data, loading, error, reload } = useApi<PriceSet[]>("/api/price-sets");
  const priceSets = data ?? EMPTY_PRICE_SETS;
  const [editing, setEditing] = useState<PriceSet | null | "new">(null);
  const [deleting, setDeleting] = useState<PriceSet | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const formFields: FormField[] = [
    { name: "name", label: "Price set name", required: true, placeholder: "e.g. Wholesale" },
    {
      name: "parentId",
      label: "Parent price set",
      type: "select",
      options: priceSets
        .filter((item) => item.id !== (editing && editing !== "new" ? editing.id : null))
        .map((item) => ({ label: item.name, value: String(item.id) })),
    },
  ];

  async function savePriceSet(values: Record<string, string | boolean>) {
    const name = String(values.name ?? "").trim();
    if (!name) throw new Error("Enter a name for this price set.");
    const parentId = String(values.parentId ?? "").trim();
    const payload = { name, parentId: parentId ? Number(parentId) : null };
    if (editing && editing !== "new") {
      await api.put(`/api/price-sets/${editing.id}`, payload);
    } else {
      await api.post("/api/price-sets", payload);
    }
    setActionError(null);
    reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await api.del(`/api/price-sets/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not delete this price set.");
    } finally {
      setDeleteBusy(false);
    }
  }

  const parentName = (id: PriceSet["parentId"]) =>
    id == null ? null : priceSets.find((item) => String(item.id) === String(id))?.name ?? "Unavailable";

  return (
    <AdminPageLayout
      title="Price Sets"
      subtitle="Organise reusable pricing groups and parent relationships"
      count={loading || error ? undefined : priceSets.length}
      countLabel="Price sets"
      actions={
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <Plus size={17} aria-hidden="true" /> Add price set
        </button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <Tag size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Price sets and product prices are managed separately</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              Create a price set here, then manage the prices assigned to products in Price Lists.
            </p>
          </div>
        </div>
        <Link
          href="/pricelists"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-900 transition-colors hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        >
          Manage price lists <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {actionError}
        </p>
      )}

      {loading ? (
        <div role="status" aria-label="Loading price sets" className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
          <div className="hidden h-12 animate-pulse bg-[var(--oh-surface)] md:block" />
          <div className="divide-y divide-[var(--oh-border)]">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 md:grid-cols-3">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-28 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-surface)] md:justify-self-end" />
            </div>)}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"><RefreshCw size={15} /> Try again</button>
        </div>
      ) : priceSets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center">
          <h2 className="text-base font-semibold text-[var(--oh-text)]">No price sets yet</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">Add a price set to organise related pricing groups.</p>
        </div>
      ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-[var(--oh-border)] md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Price set</th>
                    <th scope="col" className="px-4 py-3">Parent</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--oh-border)] bg-white">
                  {priceSets.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                      <th scope="row" className="px-4 py-3.5 font-medium text-[var(--oh-text)]">{item.name}</th>
                      <td className="px-4 py-3.5 text-[var(--oh-muted)]">{parentName(item.parentId) ?? "Top level"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setEditing(item)} className="min-h-11 min-w-11 rounded-md px-3 font-medium text-[var(--oh-primary)] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">Edit</button>
                          <button type="button" onClick={() => { setActionError(null); setDeleting(item); }} className="min-h-11 min-w-11 rounded-md px-3 font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="grid gap-3 md:hidden">
              {priceSets.map((item) => (
                <li key={item.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                      <Layers3 size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-[var(--oh-text)]">{item.name}</h2>
                      <p className="mt-1 text-xs text-[var(--oh-muted)]">Parent: {parentName(item.parentId) ?? "Top level"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-3">
                    <button type="button" onClick={() => setEditing(item)} className="min-h-11 min-w-11 rounded-md px-3 text-sm font-medium text-[var(--oh-primary)] hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">Edit</button>
                    <button type="button" onClick={() => { setActionError(null); setDeleting(item); }} className="min-h-11 min-w-11 rounded-md px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
      )}

      {editing && (
        <EntityFormModal
          key={editing === "new" ? "new-price-set" : `price-set-${editing.id}`}
          title={editing === "new" ? "Add price set" : "Edit price set"}
          fields={formFields}
          initial={editing === "new" ? { name: "", parentId: "" } : { name: editing.name, parentId: editing.parentId == null ? "" : String(editing.parentId) }}
          submitLabel={editing === "new" ? "Create price set" : "Save changes"}
          onClose={() => setEditing(null)}
          onSubmit={savePriceSet}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete price set"
        message={deleting ? `Delete “${deleting.name}”? Any records linked to this price set may prevent deletion.` : ""}
        confirmLabel="Delete price set"
        busy={deleteBusy}
        error={actionError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />
    </AdminPageLayout>
  );
}
