export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import { PurchasingWorkspace } from "@/components/PurchasingWorkspace";

export default function OdooPurchaseOrdersRoute() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading purchases…</div>}>
      <PurchasingWorkspace />
    </Suspense>
  );
}
