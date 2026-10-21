"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminOutlineButton } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { PlusIcon, CableIcon } from "@/components/icons";
import { RowActions } from "@/components/admin/RowActions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
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
  const [deleting, setDeleting] = useState<VendorConnection | null>(null);
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
      setActionError(cause instanceof Error ? cause.message : "Could not delete this vendor connection.");
    } finally {
      setDeleteBusy(false);
    }
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
      {actionError && <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}</p>}
      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading vendor connections" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-3 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 4 }, (_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 3 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : vendors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No vendor connections have been configured yet.</p>
      ) : (
        <>
          <div className="hidden xl:block">
            <ListTable
              columns={[
                { label: "Vendor" },
                { label: "Status", width: "w-[200px]" },
                { label: "Actions", align: "right", width: "w-[300px]" },
              ]}
              rows={vendors.map((v) => [
                <span key="n" className="flex items-center gap-2"><CableIcon size={18} aria-hidden="true" /> {v.name ?? ""}</span>,
                <span key="s" className="text-[var(--oh-success)]">Connected</span>,
                <RowActions key="a" onEdit={() => setEditing(v)} onDelete={() => { setActionError(null); setDeleting(v); }} />,
              ])}
            />
          </div>
          <ul role="list" aria-label="Vendor connections list" className="space-y-2 xl:hidden">
            {vendors.map((vendor) => (
              <li key={vendor.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CableIcon size={18} className="shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
                    <h2 className="min-w-0 break-words text-sm font-semibold text-[var(--oh-text)]">{vendor.name || "Unnamed vendor"}</h2>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Connected</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3 text-xs">
                  <div><dt className="text-[var(--oh-muted)]">Sender code</dt><dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{vendor.senderCode || "—"}</dd></div>
                  <div><dt className="text-[var(--oh-muted)]">Customer ID</dt><dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{vendor.customerId || "—"}</dd></div>
                </dl>
                <div className="mt-3 border-t border-[var(--oh-border)] pt-2">
                  <RowActions justify="end" onEdit={() => setEditing(vendor)} onDelete={() => { setActionError(null); setDeleting(vendor); }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <EntityFormModal title="Add Connection" fields={FIELDS} onClose={() => setCreating(false)} onSubmit={async (val) => { await api.post(BASE, body(val)); reload(); }} />
      )}
      {editing && (
        <EntityFormModal title="Edit Connection" fields={FIELDS} initial={editing as unknown as FormValues} onClose={() => setEditing(null)} onSubmit={async (val) => { await api.put(`${BASE}/${editing.id}`, body(val)); reload(); }} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete vendor connection"
        message={deleting ? `Delete “${deleting.name}”?` : ""}
        confirmLabel="Delete connection"
        busy={deleteBusy}
        error={actionError}
        onConfirm={() => void remove()}
        onCancel={() => { if (!deleteBusy) setDeleting(null); }}
      />
    </AdminPageLayout>
  );
}
