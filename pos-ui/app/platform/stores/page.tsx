"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw } from "lucide-react";
import {
  AdminPageLayout,
  AdminSearchInput,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
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
  if (value === "deleted") return "bg-slate-100 text-slate-600 border-slate-300";
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
  const hasFilters = Boolean(search.trim() || status);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPage(1);
  }

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
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          placeholder="Search name, subdomain, contact…"
        />
      }
      filters={
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="min-h-11 rounded-md border border-[var(--oh-border-strong)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)]"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Expired</option>
          <option value="deleted">Deleted</option>
        </select>
      }
      actions={
        <AdminSecondaryButton onClick={() => reload()} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          {loading ? "Refreshing…" : "Refresh"}
        </AdminSecondaryButton>
      }
    >
      {loading ? (
        <div role="status" aria-label="Loading stores" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="grid grid-cols-7 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>
          {Array.from({ length: 6 }, (_, row) => <div key={row} className="grid grid-cols-7 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 7 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={() => reload()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : items.length === 0 ? (
        <section role="status" className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          <p>{hasFilters ? "No stores match the current filters." : "No stores found."}</p>
          {hasFilters ? <button type="button" onClick={clearFilters} className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button> : <p className="mt-1">Use Create store to add a trial vendor.</p>}
        </section>
      ) : (
        <>
          <div className="hidden md:block"><ListTable columns={[{ label: "Store", width: "w-[240px]" }, { label: "Subdomain", width: "w-[230px]" }, { label: "Status", width: "w-[120px]", align: "center" }, { label: "Contact", width: "w-[170px]" }, { label: "Trial ends", width: "w-[125px]" }, { label: "Created", width: "w-[125px]" }, { label: "Open", width: "w-[100px]", align: "center" }]} rows={items.map((store) => [
            <div key={`${store.id}-name`} className="min-w-0"><Link href={`/platform/stores/${store.id}`} className="truncate font-medium text-[var(--oh-primary)] hover:underline">{store.name}</Link>{store.platformOperator ? <div className="text-xs text-[var(--oh-text-secondary)]">Platform operator</div> : null}</div>,
            <code key={`${store.id}-slug`} title={store.subdomain} className="block truncate text-[12px] text-[var(--oh-text)]">{store.subdomain}</code>,
            <span key={`${store.id}-status`} className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusTone(store.status)}`}>{store.status || "unknown"}</span>,
            <span key={`${store.id}-contact`} title={store.contactName || undefined} className="block truncate text-[var(--oh-text-secondary)]">{store.contactName || "—"}</span>,
            <span key={`${store.id}-trial`}>{formatDate(store.trialEndsAt)}</span>,
            <span key={`${store.id}-created`}>{formatDate(store.createdAt)}</span>,
            store.storeUrl ? <a key={`${store.id}-open`} href={`${store.storeUrl.replace(/\/$/, "")}/login`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--oh-primary)] hover:underline">Login</a> : <span key={`${store.id}-open`}>—</span>,
          ])} /></div>
          <div role="list" className="space-y-2 md:hidden" aria-label="Stores list">{items.map((store) => <article role="listitem" key={store.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/platform/stores/${store.id}`} className="break-words font-semibold text-[var(--oh-primary)] hover:underline">{store.name}</Link>{store.platformOperator ? <p className="mt-1 text-xs text-[var(--oh-muted)]">Platform operator</p> : null}</div><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusTone(store.status)}`}>{store.status || "unknown"}</span></div><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3 text-sm"><div><dt className="text-xs text-[var(--oh-muted)]">Subdomain</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--oh-text-secondary)]">{store.subdomain}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Contact</dt><dd className="mt-1 break-words text-[var(--oh-text-secondary)]">{store.contactName || "—"}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Trial ends</dt><dd className="mt-1 text-[var(--oh-text-secondary)]">{formatDate(store.trialEndsAt)}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Created</dt><dd className="mt-1 text-[var(--oh-text-secondary)]">{formatDate(store.createdAt)}</dd></div></dl>{store.storeUrl ? <a href={`${store.storeUrl.replace(/\/$/, "")}/login`} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]">Open store</a> : null}</article>)}</div>
        </>
      )}
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
