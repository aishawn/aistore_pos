"use client";

import { Suspense, use } from "react";
import { ExpressStocktakePage } from "@/components/admin/ExpressStocktakePage";

function ExpressStocktakeByIdInner({ id }: { id: string }) {
  return <ExpressStocktakePage stocktakeId={id} />;
}

export default function ExpressStocktakeByIdRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-white font-sans text-[14px] text-[var(--oh-muted)]">
          Loading express stocktake…
        </div>
      }
    >
      <ExpressStocktakeByIdInner id={id} />
    </Suspense>
  );
}
