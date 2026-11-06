export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PurchasingWorkspace } from "@/components/PurchasingWorkspace";

export default async function OdooPurchaseOrdersRoute({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;
  if (state === "purchase") redirect("/purchases");

  return (
    <Suspense fallback={<div className="grid h-full place-items-center p-8 text-sm text-[var(--oh-muted)]">Loading purchases…</div>}>
      <PurchasingWorkspace />
    </Suspense>
  );
}
