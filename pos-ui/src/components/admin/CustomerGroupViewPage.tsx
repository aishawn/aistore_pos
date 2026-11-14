"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ListTable } from "@/components/admin/ListTable";
import type { CustomerGroupDetail } from "@/components/admin/EditCustomerGroupPage";
import {
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  DeleteIcon,
  EditIcon,
  HomeIcon,
  ViewIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface CustomerRow {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

interface CustomerGroupRevision {
  id: string;
  action?: string;
  summary?: string;
  userName?: string;
  createdAt?: string;
}

type NavId = "home" | "revision-history";

const NAV: { id: NavId; label: string; description: string; Icon: typeof HomeIcon }[] = [
  {
    id: "home",
    label: "Home",
    description: "View customer group details",
    Icon: HomeIcon,
  },
  {
    id: "revision-history",
    label: "Revision History",
    description: "Check recent changes to this customer group",
    Icon: ClockIcon,
  },
];

function customerDisplayName(c: CustomerRow) {
  const name = c.name?.trim();
  if (name) return name;
  const company = c.company?.trim();
  if (company) return company;
  const person = [c.firstName?.trim(), c.lastName?.trim()].filter(Boolean).join(" ");
  return person || "Untitled Customer";
}

function money(x?: number | null) {
  if (x === null || x === undefined) return "Unlimited";
  return `$${Number(x).toFixed(2)}`;
}

function display(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function formatTimestamp(ts?: string) {
  if (!ts) return "—";
  const [datePart = "", timePartRaw = ""] = ts.split("T");
  const time = timePartRaw.slice(0, 8);
  const [y, m, d] = datePart.split("-");
  const date = y && m && d ? `${d}/${m}/${y}` : datePart;
  return time ? `${date} ${time}` : date;
}

function StatusItem({
  label,
  enabled,
}: {
  label: string;
  enabled: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center border-r border-[var(--oh-border)] px-4 py-4 last:border-r-0">
      <span className="text-[13px] font-medium text-[var(--oh-muted)]">{label}</span>
      <span className="mt-1.5 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--oh-text)]">
        {enabled ? (
          <>
            <CircleCheckIcon size={18} className="text-[var(--oh-success)]" />
            Enabled
          </>
        ) : (
          <>
            <CircleXIcon size={18} className="text-[var(--oh-danger)]" />
            Disabled
          </>
        )}
      </span>
    </div>
  );
}

function SummaryBar({ group }: { group: CustomerGroupDetail }) {
  return (
    <div className="mb-6 flex overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
      <StatusItem label="Loyalty" enabled={group.loyaltyEnabled ?? false} />
      <StatusItem label="Promotions" enabled={!(group.disablePromotions ?? false)} />
      <StatusItem label="Account Sales" enabled={group.allowAccountSales ?? false} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-4">
        <span className="text-[13px] font-medium text-[var(--oh-muted)]">Account Limit</span>
        <span className="mt-1.5 text-[14px] font-semibold text-[var(--oh-text)]">
          {money(group.accountLimit)}
        </span>
      </div>
    </div>
  );
}

function CustomerListPanel({
  customers,
  loading,
  error,
  onRetry,
  onView,
}: {
  customers: CustomerRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onView: (id: string) => void;
}) {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={customers.length === 0}
      emptyText="No customers belong to this group yet."
      onRetry={onRetry}
    >
        <ListTable
        columns={[
          { label: "Customers" },
          { label: "Actions", align: "right", width: "w-[120px]" },
        ]}
        rows={customers.map((c) => [
          customerDisplayName(c),
          <button
            key="view"
            type="button"
            onClick={() => onView(c.id)}
            className="inline-flex items-center gap-1 font-semibold text-[var(--sf-tab-blue)] hover:underline"
          >
            <ViewIcon size={16} /> View
          </button>,
        ])}
      />
    </AsyncState>
  );
}

function CustomerRevisionPanel({
  revisions,
  loading,
  error,
  onRetry,
}: {
  revisions: CustomerGroupRevision[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <AsyncState
      loading={loading}
      error={error}
      empty={revisions.length === 0}
      emptyText="No revision history recorded for this customer group yet."
      onRetry={onRetry}
    >
      <ListTable
        columns={[
          { label: "Date", width: "w-[180px]" },
          { label: "User", width: "w-[140px]" },
          { label: "Action", width: "w-[120px]" },
          { label: "Details" },
        ]}
        rows={revisions.map((r) => [
          formatTimestamp(r.createdAt),
          display(r.userName),
          display(r.action),
          display(r.summary),
        ])}
      />
    </AsyncState>
  );
}

/** Customer group detail view with summary bar and customer list. */
export function CustomerGroupViewPage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [nav, setNav] = useState<NavId>("home");
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);

  const { data: group, loading, error, reload: reloadGroup } = useApi<CustomerGroupDetail>(
    groupId ? `/api/customers/groups/${groupId}` : null,
  );

  const customers = useApiList<CustomerRow>(
    nav === "home" ? "/api/customers" : null,
    { groupId, page: 1, size: 500 },
  );

  const revisions = useApiList<CustomerGroupRevision>(
    nav === "revision-history" ? `/api/customers/groups/${groupId}/revisions` : null,
    { page: 1, size: 50 },
  );

  async function confirmDelete() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      await api.del(`/api/customers/groups/${groupId}`);
      router.push("/customer-groups");
    } catch (e) {
      setAlertDialog({
        title: "Delete Failed",
        message: e instanceof Error ? e.message : "Failed to delete customer group",
      });
      setDeleting(false);
    }
  }

  const groupName = group?.name?.trim() || "Customer Group";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-[var(--oh-border)] bg-[var(--oh-surface-muted)]">
          <div className="border-b border-[var(--oh-border)] px-5 py-5">
            <h1 className="text-[16px] font-bold leading-snug text-[var(--oh-text)]">
              View {groupName}
            </h1>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-3">
            {NAV.map(({ id, label, description, Icon }) => {
              const active = nav === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setNav(id)}
                  className={cn(
                    "relative flex w-full items-start gap-2.5 rounded-md px-3 py-3 text-left transition-colors",
                    active
                      ? "bg-[var(--oh-surface-elevated)] text-[var(--oh-info)] shadow-sm"
                      : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-elevated)]",
                  )}
                >
                  {active && (
                    <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-[var(--oh-info)]" />
                  )}
                  <Icon
                    size={16}
                    className={cn("mt-0.5 shrink-0", active && "text-[var(--oh-info)]")}
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0">
                    <div className={cn("text-[13px] font-semibold", active && "text-[var(--oh-info)]")}>
                      {label}
                    </div>
                    <div className="mt-0.5 text-[13px] leading-snug text-[var(--oh-muted)]">
                      {description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-[var(--oh-border)] p-4">
            <button
              type="button"
              onClick={() => router.push(`/customer-groups/${groupId}/edit`)}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border-2 border-[var(--oh-success)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-success)] transition-colors hover:bg-[var(--oh-success)]/10"
            >
              <EditIcon size={16} />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border-2 border-[var(--oh-danger)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-danger)] transition-colors hover:bg-[var(--oh-tile-red-bg)] disabled:opacity-60"
            >
              <DeleteIcon size={16} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-[var(--oh-surface)] p-6">
          <AsyncState loading={loading} error={error} empty={false} onRetry={reloadGroup}>
            {group && (
              <>
                {nav === "home" && (
                  <>
                    <SummaryBar group={group} />
                    <CustomerListPanel
                      customers={customers.items}
                      loading={customers.loading}
                      error={customers.error}
                      onRetry={customers.reload}
                      onView={(id) => router.push(`/customers/${id}/view`)}
                    />
                  </>
                )}
                {nav === "revision-history" && (
                  <CustomerRevisionPanel
                    revisions={revisions.items}
                    loading={revisions.loading}
                    error={revisions.error}
                    onRetry={revisions.reload}
                  />
                )}
              </>
            )}
          </AsyncState>
        </main>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete customer group"
        message={`Delete “${groupName}”?`}
        confirmLabel="Delete group"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { if (!deleting) setDeleteConfirmOpen(false); }}
      />
      <AlertDialog
        open={!!alertDialog}
        title={alertDialog?.title ?? ""}
        message={alertDialog?.message ?? ""}
        onClose={() => setAlertDialog(null)}
      />
    </div>
  );
}
