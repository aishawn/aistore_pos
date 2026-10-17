export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, MapPin } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export default function TransferListPage() {
  return (
    <AdminPageLayout
      title="Transfer List"
      subtitle="Locations available for stock transfers"
    >
      <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Transfer locations are not loaded from Odoo here</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6">
              The locations and row actions previously shown were sample placeholders. This page does not create or edit transfer locations, and it does not change stock.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/orders/transfer/new" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                Start a stock transfer <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
              <Link href="/settings/registers-outlets" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-950 hover:bg-amber-100">
                View Odoo locations <MapPin size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </AdminPageLayout>
  );
}
