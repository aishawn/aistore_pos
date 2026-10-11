"use client";

import { useState } from "react";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminEmptyHero,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { useApiList } from "@/hooks/useApi";
import { PlusIcon, BanIcon } from "@/components/icons";

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
  const { items, total, loading, error } = useApiList<FutureCost>("/api/future-costs", { page, size: PAGE_SIZE });
  const showTable = !loading && !error && items.length > 0;

  return (
    <AdminPageLayout
      title="Future Costs"
      subtitle="Scheduled cost changes for products"
      count={total}
      actions={
        <AdminPrimaryButton>
          <PlusIcon size={16} /> New
        </AdminPrimaryButton>
      }
      filters={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterSelect label="Supplier" placeholder="Select Supplier…" />
          <FilterSelect label="Start Date" placeholder="Select Start Date…" />
          <FilterSelect label="End Date" placeholder="Select End Date…" />
        </div>
      }
    >
      <div className="mb-4">
        <AdminPrimaryButton>Filter</AdminPrimaryButton>
      </div>

      {showTable ? (
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
