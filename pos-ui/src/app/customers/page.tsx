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
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-4">
        <h1 className="shrink-0 text-[24px] font-bold text-black">Customers</h1>
        <input
          value={search}
          maxLength={SEARCH_MAX_LENGTH}
          onChange={(e) => {
            setSearch(clampSearch(e.target.value));
            setPage(1);
          }}
          placeholder="Search Customers..."
          className="h-11 w-[320px] min-w-0 max-w-[320px] overflow-hidden rounded-lg border border-neutral-300 px-4 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--oh-primary)] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
        >
          <PlusIcon size={16} /> Add Customer
        </button>
      </div>

      <div className="mt-5">
        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          <ListTable
            headerRight={`Total ${total}`}
            headerClassName="py-2.5 text-[13px]"
            rowClassName="py-3"
            columns={[
              { label: "Customer" },
              { label: "Group" },
              { label: "Contact" },
              { label: "Actions", align: "center", width: "w-[120px]" },
            ]}
            rows={items.map((c) => [
              <button
                key="c"
                type="button"
                onClick={() => router.push(`/customers/${c.id}/view`)}
                className="block text-left leading-tight"
              >
                <span className="font-medium text-black">{c.name}</span>
                {c.code ? (
                  <>
                    <br />
                    <span className="text-[13px] text-neutral-500">{c.code}</span>
                  </>
                ) : null}
              </button>,
              c.customerGroupName ?? "",
              c.email || c.phone || "",
              <div key="a" className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => router.push(`/customers/${c.id}/edit`)}
                  className="text-[#3cb44b] hover:opacity-80"
                >
                  <EditIcon size={18} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setDeleting(c)}
                  className="text-[#e2231a] hover:opacity-80"
                >
                  <DeleteIcon size={18} />
                </button>
              </div>,
            ])}
          />
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>

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
    </div>
  );
}
