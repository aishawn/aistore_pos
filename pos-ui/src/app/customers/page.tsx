"use client";

import { Suspense, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { api } from "@/lib/api";
import { PlusIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { CreateCustomerWizard } from "@/components/admin/CreateCustomerWizard";
import { AdminPageLayout, AdminPrimaryButton } from "@/components/admin/AdminPageLayout";

interface Customer {
  id: string;
  name: string;
  company?: string;
  code?: string;
  email?: string;
  phone?: string;
  customerGroupName?: string;
}
interface Named {
  id: string;
  name: string;
}

const PAGE_SIZE = 10;
const SEARCH_MAX_LENGTH = 100;

function clampSearch(value: string) {
  return value.slice(0, SEARCH_MAX_LENGTH);
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[14px] text-neutral-500">Loading customers…</div>}>
      <CustomersPageInner />
    </Suspense>
  );
}

function CustomersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = clampSearch(searchParams.get("q")?.trim() ?? "");
  const [search, setSearch] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const q = clampSearch(searchParams.get("q")?.trim() ?? "");
    setSearch(q);
    setPage(1);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const searchQuery = debouncedSearch.trim();

  const groups = useApiList<Named>("/api/customers/groups", { page: 1, size: DROPDOWN_PAGE_SIZE });

  const { items, total, loading, error, reload } = useApiList<Customer>("/api/customers", {
    name: searchQuery || undefined,
    page,
    size: PAGE_SIZE,
  });

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`/api/customers/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete customer");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Customers"
      subtitle="Manage customer records and contact details"
      count={total}
      countLabel="Customers"
      compact
      actions={(
        <AdminPrimaryButton onClick={() => setCreating(true)} className="min-h-11 w-full justify-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2 sm:w-auto">
          <PlusIcon size={16} /> Add Customer
        </AdminPrimaryButton>
      )}
      search={(
        <div className="w-full sm:max-w-md">
          <label htmlFor="customer-search" className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
            Search customers
          </label>
          <input
            id="customer-search"
            value={search}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(e) => {
              setSearch(clampSearch(e.target.value));
              setPage(1);
            }}
            placeholder="Name, customer code or email"
            className="h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]"
          />
        </div>
      )}
    >
      {loading ? (
        <div role="status" aria-label="Loading customers" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="hidden grid-cols-4 gap-3 bg-[var(--oh-surface)] px-4 py-3 lg:grid">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div><div className="grid gap-3 p-3 lg:hidden">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-[var(--oh-surface)]" />)}</div><div className="hidden lg:block">{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-4 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 4 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div></div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center"><h2 className="text-base font-semibold text-[var(--oh-text)]">{searchQuery ? "No customers match this search." : "No customers yet."}</h2><p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">{searchQuery ? "Try a different name, code or email." : "Add a customer to get started."}</p></div>
      ) : (
        <>
        <div className="space-y-3 lg:hidden">
          {items.map((c) => (
            <article key={c.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => router.push(`/customers/${c.id}/view`)} className="min-w-0 text-left outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">
                  <span className="block break-words font-semibold text-[var(--oh-text)]">{c.name}</span>
                  {c.code && <span className="mt-0.5 block text-sm text-[var(--oh-muted)]">{c.code}</span>}
                </button>
                {c.customerGroupName && <span className="max-w-[42%] shrink-0 truncate rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{c.customerGroupName}</span>}
              </div>
              <div className="mt-3 space-y-1 border-t border-[var(--oh-border)] pt-3 text-sm text-[var(--oh-text-secondary)]">
                {c.email && <p className="break-words">{c.email}</p>}
                {c.phone && <p>{c.phone}</p>}
                {!c.email && !c.phone && <p className="text-[var(--oh-muted)]">No contact details</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--oh-border)] pt-3">
                <button type="button" onClick={() => router.push(`/customers/${c.id}/edit`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--oh-border)] text-sm font-medium text-[var(--oh-primary)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><EditIcon size={16} /> Edit</button>
                <button type="button" onClick={() => setDeleting(c)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 text-sm font-medium text-[var(--oh-danger)] outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-[var(--oh-danger)]"><DeleteIcon size={16} /> Delete</button>
              </div>
            </article>
          ))}
        </div>
        <div className="hidden lg:block">
        <ListTable
          rowClassName="py-3"
          columns={[
            { label: "Customer" },
            { label: "Group" },
            { label: "Contact" },
            { label: "Actions", align: "center", width: "w-[144px]" },
          ]}
          rows={items.map((c) => [
            <button
              key="c"
              type="button"
              onClick={() => router.push(`/customers/${c.id}/view`)}
              className="block min-w-0 text-left leading-tight"
            >
              <span className="font-medium text-[var(--oh-text)]">{c.name}</span>
              {c.code ? (
                <>
                  <br />
                  <span className="text-[13px] text-[var(--oh-muted)]">{c.code}</span>
                </>
              ) : null}
            </button>,
            c.customerGroupName ?? "",
            <div key="contact" className="min-w-0 text-[13px] leading-5 text-[var(--oh-text-secondary)]">
              {c.email && <div className="truncate" title={c.email}>{c.email}</div>}
              {c.phone && <div className="truncate" title={c.phone}>{c.phone}</div>}
              {!c.email && !c.phone && <span>—</span>}
            </div>,
            <div key="a" className="flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label={`Edit ${c.name}`}
                onClick={() => router.push(`/customers/${c.id}/edit`)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
              >
                <EditIcon size={18} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${c.name}`}
                onClick={() => setDeleting(c)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--oh-danger)] transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-danger)]"
              >
                <DeleteIcon size={18} />
              </button>
            </div>,
          ])}
        />
        </div>
        </>
      )}
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete Customer"
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
        title="Delete Customer Failed"
        message={deleteError ?? "Unable to delete customer."}
        variant="danger"
        onClose={() => setDeleteError(null)}
      />

      {creating && (
        <CreateCustomerWizard
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => reload()}
          groups={groups.items}
        />
      )}
    </AdminPageLayout>
  );
}
