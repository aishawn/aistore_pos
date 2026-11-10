import { Suspense } from "react";
import { OdooProductCataloguePage } from "@/components/OdooProductCataloguePage";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** Owner-locked shell: full catalogue with More / totals. Do not swap to Native/Shopfront without explicit owner approval. */
export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading products…</div>}>
      <OdooProductCataloguePage />
    </Suspense>
  );
}
