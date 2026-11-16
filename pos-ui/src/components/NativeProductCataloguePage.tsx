"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";
import { naturalSortRows } from "@/lib/natural-sort";
import { productCostDisplay } from "@/lib/product-cost-display";

type ProductRow = {
  id: number | string;
  name: string;
  status?: string;
  costPercentage?: boolean;
  categoryName?: string;
  brandName?: string;
  cost?: number | null;
  caseQuantity?: number | null;
  price?: number | null;
  stockQuantity?: number | null;
};

const PAGE_SIZE = 40;

export function NativeProductCataloguePage() {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const search = useDebouncedValue(query.trim(), 250);
  const { items, total, loading, error, reload } = useApiList<ProductRow>("/api/products", {
    name: search || undefined,
    page,
    size: PAGE_SIZE,
  });
  const sortedItems = useMemo(
    () => naturalSortRows(items, (product) => product.name, (product) => product.id),
    [items],
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] px-4 pb-6 md:px-6">
      <header className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Source: Orithos ledger</p>
          <h1 className="oh-type-title text-[var(--oh-text)]">Products</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">{total} products</p>
        </div>
        {hasPermission("stock.products.edit") && (
          <Link href="/products/new" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">New product</Link>
        )}
      </header>
      <label className="flex min-h-11 max-w-xl items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3">
        <Search size={16} className="text-[var(--oh-muted)]" aria-hidden="true" />
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search products" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      {error && <div role="alert" className="flex items-center justify-between gap-3 border border-red-200 bg-red-50 p-3 text-sm text-red-900"><span>{error}</span><button type="button" onClick={reload} className="min-h-10 rounded border border-red-300 px-3 font-semibold">Retry</button></div>}
      {loading ? <p role="status" className="py-10 text-center text-sm text-[var(--oh-muted)]">Loading products…</p> : error ? null : items.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-center text-[var(--oh-muted)]"><PackageSearch className="mx-auto" size={24} /><p className="mt-2 text-sm">{search ? "No products match this search." : "No products found."}</p></div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-[var(--oh-border)] bg-white">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Brand</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {sortedItems.map((product) => {
                  const cost = productCostDisplay(product.cost, product.caseQuantity, product.status, product.costPercentage);
                  return (
                    <tr key={String(product.id)} className="hover:bg-[var(--oh-surface)]">
                      <td className="px-4 py-3"><Link href={`/products/${product.id}/view`} className="font-semibold text-[var(--oh-primary)] hover:underline">{product.name}</Link></td>
                      <td className="px-4 py-3 text-[var(--oh-muted)]">{product.categoryName || "—"}</td>
                      <td className="px-4 py-3 text-[var(--oh-muted)]">{product.brandName || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{product.price == null ? "—" : `$${Number(product.price).toFixed(2)}`}</td>
                      <td className="px-4 py-3 text-right tabular-nums" aria-label="Cost from Shopfront">
                        {cost ? <span className="inline-flex flex-col items-end"><span>{cost.caseCost}</span>{cost.itemCost && <span className="text-xs text-[var(--oh-muted)]">{cost.itemCost}</span>}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{product.stockQuantity == null ? "—" : Number(product.stockQuantity).toLocaleString("en-AU")}</td>
                      <td className="px-4 py-3 text-right"><Link href={`/products/${product.id}/view`} className="font-semibold text-[var(--oh-primary)] hover:underline">View</Link></td>
                    </tr>
                  );
                })}
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
