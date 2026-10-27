import { Suspense } from "react";
import { OdooProductCataloguePage } from "@/components/OdooProductCataloguePage";

export default function InventoryReportsPage() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading inventory…</div>}>
      <OdooProductCataloguePage />
    </Suspense>
  );
}
