export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Info } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export default function FavouriteReportsPage() {
  return (
    <AdminPageLayout
      title="Favourite Reports"
      subtitle="Quick access to your saved reports"
    >
      <section role="status" className="rounded-xl border border-sky-200 bg-sky-50/70 p-5 text-sky-950 sm:p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 shrink-0 text-sky-700" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Saved report favourites are not connected in this pilot</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6">
              Search and filter controls on this page were visual placeholders. Orithos does not save favourite reports or email schedules here, so no report data is shown as if it were live.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/overview" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                Open Overview <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-6 rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center">
        <Bookmark className="mx-auto text-[var(--oh-muted)]" size={24} aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-[var(--oh-text)]">No saved report favourites</p>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">Use Overview to review live Odoo sales totals.</p>
      </div>
    </AdminPageLayout>
  );
}
