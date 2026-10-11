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
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { EntityFormModal, FormValues, FormField } from "@/components/admin/EntityFormModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
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
      alert(e instanceof Error ? e.message : "Failed to delete customer group");
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
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
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
      </AsyncState>

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
