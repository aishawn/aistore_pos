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
        <div className="flex h-full flex-col overflow-auto bg-white px-6 py-6 font-sans md:px-10 md:py-8">
          <h1 className="text-[34px] font-bold leading-tight text-black">Express Stocktake</h1>
          <p className="mt-1 text-[16px] text-neutral-500">Scanning …</p>
        </div>
      }
    >
      <ExpressStocktakeRouteInner />
    </Suspense>
  );
}
