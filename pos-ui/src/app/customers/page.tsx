"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListTable } from "@/components/admin/ListTable";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { api } from "@/lib/api";
import { PlusIcon, EditIcon, DeleteIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
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
      alert(e instanceof Error ? e.message : "Failed to delete customer");
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
        <AdminPrimaryButton onClick={() => setCreating(true)} className="min-h-11">
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
            className="h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-1 focus:ring-[var(--oh-primary)]"
          />
        </div>
      )}
    >
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
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
      </AsyncState>
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
