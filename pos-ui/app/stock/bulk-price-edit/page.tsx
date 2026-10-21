import { Suspense } from "react";
import { OdooBulkPriceEditPage } from "@/components/OdooBulkPriceEditPage";

export default function BulkPriceEditRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-600">Loading bulk price editor…</div>}>
      <OdooBulkPriceEditPage />
    </Suspense>
  );
}
