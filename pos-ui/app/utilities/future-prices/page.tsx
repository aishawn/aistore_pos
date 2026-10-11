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
  const { items, total, loading, error } = useApiList<FuturePrice>("/api/future-prices", { page, size: PAGE_SIZE });
  const showTable = !loading && !error && items.length > 0;

  return (
    <AdminPageLayout
      title="Future Prices"
      subtitle="Scheduled price changes for products"
      count={total}
      actions={
        <AdminPrimaryButton>
          <PlusIcon size={16} /> New
        </AdminPrimaryButton>
      }
      filters={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterSelect label="Price Set" placeholder="Select Price Set…" />
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
              { label: "Price", width: "w-[200px]" },
              { label: "Effective", width: "w-[260px]" },
            ]}
            rows={items.map((p) => [p.productId ?? "", `$${Number(p.price).toFixed(2)}`, p.effectiveTime ?? ""])}
          />
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
