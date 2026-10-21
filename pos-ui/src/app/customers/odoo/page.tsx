export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import { OdooCustomerDirectoryPage } from "@/components/OdooCustomerDirectoryPage";

export default function OdooCustomerDirectoryRoute() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading customers...</div>}>
      <OdooCustomerDirectoryPage />
    </Suspense>
  );
}
