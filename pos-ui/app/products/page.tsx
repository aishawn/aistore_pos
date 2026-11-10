import { Suspense } from "react";
import { NativeProductCataloguePage } from "@/components/NativeProductCataloguePage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading products…</div>}>
      <NativeProductCataloguePage />
    </Suspense>
  );
}
