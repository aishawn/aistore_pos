import { Suspense } from "react";
import { ShopfrontSourceDataPage } from "@/components/ShopfrontSourceDataPage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading products…</div>}>
      <ShopfrontSourceDataPage mode="products" />
    </Suspense>
  );
}
