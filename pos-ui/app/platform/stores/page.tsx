"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AdminPageLayout,
  AdminSearchInput,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

interface StoreRow {
  id: number;
  name: string;
  subdomain: string;
  status: string;
  contactName?: string | null;
  storeUrl?: string | null;
  trialEndsAt?: string | null;
  createdAt?: string | null;
  platformOperator?: boolean;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function statusTone(status: string | null | undefined): string {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (value === "trial") return "bg-sky-50 text-sky-800 border-sky-200";
  if (value === "suspended" || value === "expired") return "bg-red-50 text-red-800 border-red-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PlatformStoresPage() {
  const { user, ready } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const { items, total, loading, error, reload } = useApiList<StoreRow>(
    ready && user ? "/api/admin/tenants" : null,
    {
      q: debouncedSearch || undefined,
      status: status || undefined,
      page,
      size: PAGE_SIZE,
    },
  );

  if (!ready || !user) {
    return null;
  }

  return (
    <AdminPageLayout
      title="Stores"
      subtitle="Platform admin view of every vendor. Store owners from brand signup manage staff only inside their own store URL."
      count={total}
      countLabel="Stores"
      search={
        <AdminSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, subdomain, contact…"
        />
      }
      filters={
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Expired</option>
        </select>
      }
      actions={
        <AdminSecondaryButton onClick={() => reload()}>Refresh</AdminSecondaryButton>
      }
    >
      <AsyncState
        loading={loading}
        error={error}
        empty={items.length === 0}
        emptyText="No stores found. Use Create store to add a trial vendor."
      >
        <ListTable
          columns={[
            { label: "Store", width: "w-[220px]" },
            { label: "Subdomain", width: "w-[180px]" },
            { label: "Status", width: "w-[120px]", align: "center" },
            { label: "Contact", width: "w-[160px]" },
            { label: "Trial ends", width: "w-[120px]" },
            { label: "Created", width: "w-[120px]" },
            { label: "Open", width: "w-[100px]", align: "center" },
          ]}
          rows={items.map((store) => [
            <div key={`${store.id}-name`} className="min-w-0">
              <Link href={`/platform/stores/${store.id}`} className="truncate font-medium text-[var(--oh-primary)] hover:underline">
                {store.name}
              </Link>
              {store.platformOperator ? (
                <div className="text-xs text-[var(--oh-text-secondary)]">Platform operator</div>
              ) : null}
            </div>,
            <code key={`${store.id}-slug`} className="text-[12px] text-[var(--oh-text)]">
              {store.subdomain}
            </code>,
            <span
              key={`${store.id}-status`}
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusTone(store.status)}`}
            >
              {store.status || "unknown"}
            </span>,
            <span key={`${store.id}-contact`} className="truncate text-[var(--oh-text-secondary)]">
              {store.contactName || "—"}
            </span>,
            <span key={`${store.id}-trial`}>{formatDate(store.trialEndsAt)}</span>,
            <span key={`${store.id}-created`}>{formatDate(store.createdAt)}</span>,
            store.storeUrl ? (
              <a
                key={`${store.id}-open`}
                href={`${store.storeUrl.replace(/\/$/, "")}/login`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--oh-primary)] hover:underline"
              >
                Login
              </a>
            ) : (
              <span key={`${store.id}-open`}>—</span>
            ),
          ])}
        />
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </AsyncState>
    </AdminPageLayout>
  );
}
