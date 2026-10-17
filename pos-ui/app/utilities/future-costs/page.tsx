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

interface FutureCost {
  id: string;
  productId: string;
  supplierId: string;
  quantity: number;
  cost: number;
  costEx: number;
  userId: string;
  effectiveTime: string;
}

export default function FutureCostsPage() {
  const [page, setPage] = useState(1);
  const { items, total, loading, error, reload } = useApiList<FutureCost>("/api/future-costs", { page, size: PAGE_SIZE });
  const showTable = !loading && !error && items.length > 0;

  return (
    <AdminPageLayout
      title="Future Costs"
      subtitle="Scheduled cost changes for products"
      count={total}
    >
      <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p className="max-w-3xl">
          Future cost schedules are currently read-only in this pilot. Create or update supplier costs from the purchasing workflow when that integration is available.
        </p>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading future costs" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-3 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-3 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 3 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : showTable ? (
        <>
          <ListTable
            columns={[
              { label: "Product" },
              { label: "Cost", width: "w-[200px]" },
              { label: "Effective", width: "w-[260px]" },
            ]}
            rows={items.map((c) => [c.productId ?? "", `$${Number(c.cost).toFixed(2)}`, c.effectiveTime ?? ""])}
          />
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      ) : (
        !loading && !error && (
          <AdminEmptyHero
            icon={<BanIcon size={80} strokeWidth={1.5} />}
            title="No Future Costs"
            description="There are no costs set to be activated in the future."
          />
        )
      )}
    </AdminPageLayout>
  );
}
