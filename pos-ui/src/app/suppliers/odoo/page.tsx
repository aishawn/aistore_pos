export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import { OdooSupplierDirectoryPage } from "@/components/OdooSupplierDirectoryPage";

export default function OdooSupplierDirectoryRoute() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading suppliers...</div>}>
      <OdooSupplierDirectoryPage />
    </Suspense>
  );
}
