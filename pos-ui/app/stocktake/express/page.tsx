"use client";

import { Suspense } from "react";
import { ExpressStocktakePage } from "@/components/admin/ExpressStocktakePage";

function ExpressStocktakeRouteInner() {
  return <ExpressStocktakePage />;
}

export default function ExpressStocktakeRoute() {
  return (
    <Suspense
      fallback={
        <main role="status" className="h-full overflow-auto bg-[var(--oh-surface)] p-4 font-sans sm:p-6">
          <div className="mx-auto w-full max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Inventory · Express mode</p>
            <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Express stocktake</h1>
            <div className="mt-4 space-y-3" aria-hidden="true"><div className="h-12 animate-pulse rounded-lg bg-[var(--oh-border)]" /><div className="h-40 animate-pulse rounded-xl bg-[var(--oh-border)]" /></div>
          </div>
        </main>
      }
    >
      <ExpressStocktakeRouteInner />
    </Suspense>
  );
}
