"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSearchInput,
  AdminRowActions,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { RefreshCw } from "lucide-react";
import { Pagination } from "@/components/admin/Pagination";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { api } from "@/lib/api";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { UsersIcon } from "@/components/icons";

interface CustomerGroup {
  id: string;
  name: string;
  customerCount?: number;
}

const BASE = "/api/customers/groups";
const FIELDS: FormField[] = [{ name: "name", label: "Name", type: "text" }];
const body = (v: FormValues) => ({ name: v.name });
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function CustomerGroupsPageInner() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { creating, setCreating, initial, clearInitial } = useAiCreateOpen<{ name: string }>(
    "customer_group",
  );
  const [deleting, setDeleting] = useState<CustomerGroup | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const searchQuery = debouncedSearch.trim();

  const { items, total, loading, error, reload } = useApiList<CustomerGroup>(BASE, {
    name: searchQuery || undefined,
    page,
    size: PAGE_SIZE,
  });

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`${BASE}/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete customer group");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Customer Group"
      subtitle="Organise customers into groups for pricing and reporting"
      count={total}
      actions={
        <AdminPrimaryButton
          onClick={() => {
            clearInitial();
            setCreating(true);
          }}
        >
          <UsersIcon size={16} /> Add Customer Group
        </AdminPrimaryButton>
      }
      search={
        <AdminSearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search customer groups…"
        />
      }
    >
      {loading ? (
        <div role="status" aria-label="Loading customer groups" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="grid grid-cols-3 gap-3 bg-[var(--oh-surface)] px-4 py-3">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}
          </div>
          {Array.from({ length: 5 }, (_, row) => (
            <div key={row} className="grid grid-cols-3 gap-3 border-t border-[var(--oh-border)] px-4 py-4">
              {Array.from({ length: 3 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}
            </div>
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>{error}</span>
          <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100">
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No customer groups match the current search.</p>
      ) : (
        <>
          <ListTable
            columns={[
              { label: "Customer Group" },
              { label: "Number of Customers" },
              { label: "Actions", align: "center", width: "w-[240px]" },
            ]}
            rows={items.map((g) => [
              g.name,
              String(g.customerCount ?? 0),
              <AdminRowActions
                key="a"
                onView={() => router.push(`/customer-groups/${g.id}/view`)}
                onEdit={() => router.push(`/customer-groups/${g.id}/edit`)}
                onDelete={() => setDeleting(g)}
              />,
            ])}
          />
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}

      {creating && (
        <EntityFormModal
          title="Add Customer Group"
          fields={FIELDS}
          initial={initial?.name ? { name: initial.name } : undefined}
          onClose={() => {
            clearInitial();
            setCreating(false);
          }}
          onSubmit={async (v) => {
            await api.post(BASE, body(v));
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete Customer Group"
        message={
          deleting
            ? `Are you sure you want to delete "${deleting.name}"? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />
      <AlertDialog
        open={deleteError !== null}
        title="Delete Customer Group Failed"
        message={deleteError ?? "Unable to delete customer group."}
        variant="danger"
        onClose={() => setDeleteError(null)}
      />
    </AdminPageLayout>
  );
}

export default function CustomerGroupsPage() {
  return (
    <Suspense fallback={null}>
      <CustomerGroupsPageInner />
    </Suspense>
  );
}
