"use client";

import { useState } from "react";
import { CalendarDays, Info, LoaderCircle, Megaphone, RefreshCw, Search } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";

interface Promotion {
  id: string;
  name: string;
  active: boolean;
  start: string | null;
  end: string | null;
}

const PAGE_SIZE = 20;

function formatDate(value: string | null) {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(date);
}

export default function PromotionsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);
  const { items, total, loading, error, reload } = useApiList<Promotion>("/api/promotions", {
    name: debouncedSearch.trim() || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <AdminPageLayout
      title="Promotions"
      subtitle="Browse campaigns currently available to this POS"
      count={loading || error ? undefined : total}
      countLabel="Promotions"
      actions={
        <AdminSecondaryButton className="min-h-11" onClick={reload} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
          Refresh
        </AdminSecondaryButton>
      }
      search={
        <label className="flex min-h-11 items-center gap-2.5 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-muted)] focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
          <Search size={17} aria-hidden="true" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label="Search promotions by name" placeholder="Search promotions by name" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)]" />
        </label>
      }
    >
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
        <Info size={18} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
        <p className="leading-5">This screen is read only. Promotion creation and advanced filters are not available here yet.</p>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading promotions" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="hidden h-12 animate-pulse bg-[var(--oh-surface)] md:block" />
          <div className="divide-y divide-[var(--oh-border)]">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 md:grid-cols-4">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--oh-surface)]" />
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--oh-surface)]" />
            </div>)}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"><RefreshCw size={15} /> Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)]"><Megaphone size={19} aria-hidden="true" /></span>
          <h2 className="mt-3 text-base font-semibold text-[var(--oh-text)]">No promotions found</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">Try another search term or clear the search to see all available promotions.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-[var(--oh-border)] md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Promotion</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Start date</th>
                  <th scope="col" className="px-4 py-3">End date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)] bg-white">
                {items.map((promotion) => (
                  <tr key={promotion.id} className="transition-colors hover:bg-slate-50/70">
                    <th scope="row" className="px-4 py-3.5 font-medium text-[var(--oh-text)]">{promotion.name}</th>
                    <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${promotion.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{promotion.active ? "Active" : "Inactive"}</span></td>
                    <td className="px-4 py-3.5 tabular-nums text-[var(--oh-text-secondary)]">{formatDate(promotion.start)}</td>
                    <td className="px-4 py-3.5 tabular-nums text-[var(--oh-text-secondary)]">{formatDate(promotion.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {items.map((promotion) => (
              <li key={promotion.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-sm font-semibold text-[var(--oh-text)]">{promotion.name}</h2>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${promotion.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{promotion.active ? "Active" : "Inactive"}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3">
                  <div><p className="flex items-center gap-1 text-xs text-[var(--oh-muted)]"><CalendarDays size={13} aria-hidden="true" />Starts</p><p className="mt-1 text-sm tabular-nums text-[var(--oh-text-secondary)]">{formatDate(promotion.start)}</p></div>
                  <div><p className="flex items-center gap-1 text-xs text-[var(--oh-muted)]"><CalendarDays size={13} aria-hidden="true" />Ends</p><p className="mt-1 text-sm tabular-nums text-[var(--oh-text-secondary)]">{formatDate(promotion.end)}</p></div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}
    </AdminPageLayout>
  );
}
