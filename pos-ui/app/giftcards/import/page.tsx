import Link from "next/link";
import { AlertCircle, ArrowUpRight } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export default function GiftCardImportPage() {
  return (
    <AdminPageLayout title="Import Gift Cards" subtitle="Orithos-backed gift cards">
      <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Classic gift card import is retired</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6">
              Gift cards are managed through Orithos when a Loyalty or Gift Card module is installed.
              Bulk import from Classic MySQL spreadsheets is not used as a live source of truth.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/giftcards" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                Open gift cards <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </AdminPageLayout>
  );
}
