import { Suspense } from "react";
import { OdooReplenishmentPage } from "@/components/OdooReplenishmentPage";

export default function ReplenishmentRoute() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading replenishment…</div>}>
      <OdooReplenishmentPage />
    </Suspense>
  );
}
