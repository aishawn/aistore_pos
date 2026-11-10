"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Truck } from "lucide-react";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";

type SupplierRow = {
  id: number | string;
  name: string;
  code?: string;
  email?: string;
  phone?: string;
  status?: string;
};

const PAGE_SIZE = 40;

export function NativeSupplierDirectoryPage() {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(query.trim(), 250);
  const { items, total, loading, error, reload } = useApiList<SupplierRow>("/api/suppliers", {
    name: search || undefined,
    page,
    size: PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] px-4 pb-6 md:px-6">
      <header className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Source: Orithos ledger</p>
          <h1 className="oh-type-title text-[var(--oh-text)]">Suppliers</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">{total} suppliers</p>
        </div>
        {hasPermission("stock.suppliers.edit") && (
          <Link href="/suppliers/new" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">New supplier</Link>
        )}
      </header>
      <label className="flex min-h-11 max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
        <Search size={16} className="text-[var(--oh-muted)]" aria-hidden="true" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search suppliers" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      {error && <div role="alert" className="flex items-center justify-between gap-3 border border-red-200 bg-red-50 p-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={reload} className="min-h-10 rounded border border-red-300 px-3 font-semibold">Retry</button></div>}
      {loading ? <p role="status" className="py-10 text-center text-sm text-[var(--oh-muted)]">Loading suppliers…</p> : error ? null : items.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-center text-[var(--oh-muted)]"><Truck className="mx-auto" size={24} /><p className="mt-2 text-sm">{search ? "No suppliers match this search." : "No suppliers found."}</p></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[var(--oh-border)] bg-white">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {items.map((supplier) => (
                  <tr key={String(supplier.id)} className="hover:bg-[var(--oh-surface)]">
                    <td className="px-4 py-3"><Link href={`/suppliers/${supplier.id}/view`} className="font-semibold text-[var(--oh-primary)] hover:underline">{supplier.name}</Link>{supplier.code ? <span className="ml-2 text-xs text-[var(--oh-muted)]">{supplier.code}</span> : null}</td>
                    <td className="px-4 py-3 text-[var(--oh-muted)]">{supplier.phone || supplier.email || "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-muted)]">{supplier.status || "—"}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/suppliers/${supplier.id}/view`} className="font-semibold text-[var(--oh-primary)] hover:underline">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-3 text-sm text-[var(--oh-muted)]">
            <span>Page {page} of {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50">Previous</button>
              <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50">Next</button>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
