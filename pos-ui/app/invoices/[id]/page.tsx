"use client";

import { use } from "react";
import { InvoiceScanDetailPage } from "@/components/admin/InvoiceScanDetailPage";

export default function InvoiceScanDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const scanId = Number(id);
  if (!Number.isSafeInteger(scanId) || scanId < 1) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] px-4 text-sm text-rose-800">
        Invalid invoice scan id.
      </main>
    );
  }
  return <InvoiceScanDetailPage scanId={scanId} />;
}
