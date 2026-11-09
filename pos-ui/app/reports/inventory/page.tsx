import { Suspense } from "react";
import { ShopfrontSourceDataPage } from "@/components/ShopfrontSourceDataPage";

export default function InventoryReportsPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading inventory…</div>}>
      <ShopfrontSourceDataPage mode="inventory" />
    </Suspense>
  );
}
