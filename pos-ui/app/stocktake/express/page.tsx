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
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--oh-muted)]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--oh-border)] border-t-[var(--oh-primary)]" />Preparing scanner…</p>
          </div>
        </main>
      }
    >
      <ExpressStocktakeRouteInner />
    </Suspense>
  );
}
