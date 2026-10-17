"use client";

import { useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  AdminPageLayout,
  AdminEmptyHero,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";
import { BanIcon } from "@/components/icons";


const PAGE_SIZE = 20;

interface FuturePrice {
  id: string;
  productId: string;
  priceSetId: string;
  quantity: number;
  price: number;
  priceEx: number;
  userId: string;
  effectiveTime: string;
}

export default function FuturePricesPage() {
  const [page, setPage] = useState(1);
  const { items, total, loading, error, reload } = useApiList<FuturePrice>("/api/future-prices", { page, size: PAGE_SIZE });
  const showTable = !loading && !error && items.length > 0;

  return (
    <AdminPageLayout
      title="Future Prices"
      subtitle="Scheduled price changes for products"
      count={total}
    >
      <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="max-w-3xl">
          Future price schedules are currently read-only in this pilot. Manage active prices from Price Sets when that workflow is available.
        </p>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading future prices" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-3 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 3 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : showTable ? (
        <>
          <div className="hidden md:block">
            <ListTable
              columns={[
                { label: "Product" },
                { label: "Price", width: "w-[200px]" },
                { label: "Effective", width: "w-[260px]" },
              ]}
              rows={items.map((p) => [p.productId ?? "", `$${Number(p.price).toFixed(2)}`, p.effectiveTime ?? ""])}
            />
          </div>
          <div className="space-y-2 md:hidden" aria-label="Future prices list">
            {items.map((p) => (
              <article key={p.id} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--oh-text)]">{p.productId || "Unknown product"}</p>
                    <p className="mt-1 text-xs text-[var(--oh-muted)]">Effective {p.effectiveTime || "Not scheduled"}</p>
                  </div>
                  <p className="shrink-0 text-base font-semibold text-[var(--oh-text)]">${Number(p.price).toFixed(2)}</p>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      ) : (
        !loading && !error && (
          <AdminEmptyHero
            icon={<BanIcon size={80} strokeWidth={1.5} />}
            title="No Future Prices"
            description="There are no prices set to be activated in the future."
          />
        )
      )}
    </AdminPageLayout>
  );
}
