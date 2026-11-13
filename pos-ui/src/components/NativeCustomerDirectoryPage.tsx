"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, Search, UserRound } from "lucide-react";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";
import { naturalSortRows } from "@/lib/natural-sort";
import type { CustomerListItem } from "@/lib/api";
import { NativeCustomerViewModal } from "@/components/NativeCustomerViewModal";

const PAGE_SIZE = 40;

function PerformanceSparkline({ values, name }: { values?: number[] | null; name: string }) {
  const series = Array.isArray(values) ? values : [];
  const total = series.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const maximum = Math.max(1, ...series);
  const points = series.map((value, index) => {
    const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * 156;
    const y = 30 - (Math.max(0, value) / maximum) * 27;
    return `${x},${y}`;
  }).join(" ");

  if (series.length === 0) {
    return <span className="text-xs text-[var(--oh-muted)]">No data</span>;
  }

  return (
    <span className="inline-flex min-w-[164px] items-center gap-2" title={`${total} units in the last 30 days`}>
      <svg viewBox="0 0 156 32" role="img" aria-label={`${name}: ${total} units sold in the last 30 days`} className="h-8 w-[156px] text-[var(--oh-primary)]">
        <line x1="0" y1="31" x2="156" y2="31" stroke="currentColor" strokeOpacity=".18" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="sr-only">{total} units</span>
    </span>
  );
}

export function NativeCustomerDirectoryPage() {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const search = useDebouncedValue(query.trim(), 250);
  const { items, total, loading, error, reload } = useApiList<CustomerListItem>(
    "/api/customers",
    { name: search || undefined, page, size: PAGE_SIZE },
  );
  const sortedItems = useMemo(
    () => naturalSortRows(items, (customer) => customer.name, (customer) => customer.id),
    [items],
  );

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] px-4 pb-6 md:px-6">
      <header className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Customers</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">{total} customers</p>
        </div>
        {hasPermission("customers.edit") && (
          <Link href="/customers/new" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">New customer</Link>
        )}
      </header>

      <label className="flex min-h-11 max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
        <Search size={16} className="text-[var(--oh-muted)]" aria-hidden="true" />
        <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search customers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>

      {error && <div role="alert" className="flex items-center justify-between gap-3 border border-red-200 bg-red-50 p-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={reload} className="min-h-10 rounded border border-red-300 px-3 font-semibold">Retry</button></div>}
      {loading ? <p role="status" className="py-10 text-center text-sm text-[var(--oh-muted)]">Loading customers…</p> : error ? null : items.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-center text-[var(--oh-muted)]"><div><UserRound className="mx-auto" size={24} /><p className="mt-2 text-sm">{search ? "No customers match this search." : "No customers found."}</p></div></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[var(--oh-border)] bg-white">
            <table aria-label="Customers" className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3">Customer</th><th scope="col" className="px-4 py-3">Contact</th><th scope="col" className="px-4 py-3">Group</th><th scope="col" className="px-4 py-3 text-center">Performance</th><th scope="col" className="px-4 py-3 text-right">Owing</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--oh-border)]">{sortedItems.map((customer) => (
                <tr key={customer.id} className="hover:bg-[var(--oh-surface)]">
                  <td className="px-4 py-3"><button type="button" onClick={() => setSelectedCustomer(customer)} className="text-left font-semibold text-[var(--oh-primary)] hover:underline">{customer.name}</button>{customer.code && <span className="ml-2 text-xs text-[var(--oh-muted)]">{customer.code}</span>}</td>
                  <td className="px-4 py-3 text-[var(--oh-muted)]">{customer.phone || customer.email || "—"}</td>
                  <td className="px-4 py-3 text-[var(--oh-muted)]">{customer.customerGroupName || "—"}</td>
                  <td className="px-4 py-2 text-center"><PerformanceSparkline values={customer.performance30d} name={customer.name} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{customer.currentOwing == null ? "—" : `$${Number(customer.currentOwing).toFixed(2)}`}</td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedCustomer(customer)} aria-label={`View ${customer.name}`} title={`View ${customer.name}`} className="inline-flex min-h-10 items-center gap-2 font-semibold text-[var(--oh-primary)] hover:underline"><Eye size={16} />View</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 text-sm text-[var(--oh-muted)]"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50">Previous</button><button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50">Next</button></div></footer>
        </>
      )}
      <NativeCustomerViewModal customerId={selectedCustomer?.id ?? null} onClose={() => setSelectedCustomer(null)} />
    </main>
  );
}
