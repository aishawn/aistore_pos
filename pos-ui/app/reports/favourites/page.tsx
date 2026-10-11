import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";

export default function FavouriteReportsPage() {
  return (
    <AdminPageLayout
      title="Favourite Reports"
      subtitle="Quick access to your saved reports"
      filters={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Report Name</span>
            <input
              placeholder="Search report name…"
              className="h-10 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)]"
            />
          </label>
          <FilterSelect label="Report Type" placeholder="Filter report types…" />
          <FilterSelect label="Email Filter" placeholder="Filter report emailing…" />
        </div>
      }
    >
      <p className="py-16 text-center text-[15px] text-[var(--oh-muted)]">No reports found.</p>
    </AdminPageLayout>
  );
}
