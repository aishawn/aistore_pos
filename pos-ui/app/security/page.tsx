import {
  AdminPageLayout,
  AdminEmptyHero,
} from "@/components/admin/AdminPageLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { ShieldCheckIcon } from "@/components/icons";

export default function SecurityCentrePage() {
  return (
    <AdminPageLayout
      title="Security Centre"
      subtitle="Monitor login events and security patterns"
      actions={
        <span className="flex h-10 items-center rounded-lg border border-[var(--oh-border)] bg-white px-4 text-[13px] text-[var(--oh-text-secondary)]">
          29/06/2026 00:00:00 — 29/06/2026 23:59:59
        </span>
      }
    >
      <div className="mb-8 flex items-center justify-center gap-12 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] py-10">
        <div className="flex flex-col gap-2 text-[14px]">
          <span className="flex items-center gap-2 text-[var(--oh-text-secondary)]">
            <span className="h-3.5 w-3.5 rounded-sm bg-[var(--oh-orange)]" /> Login
          </span>
          <span className="flex items-center gap-2 text-[var(--oh-text-secondary)]">
            <span className="h-3.5 w-3.5 rounded-sm bg-[var(--oh-danger)]" /> Location Change
          </span>
        </div>
        <svg width="200" height="200" viewBox="0 0 32 32" className="-rotate-90">
          <circle r="16" cx="16" cy="16" fill="var(--oh-orange)" />
          <path d="M16 16 L16 0 A16 16 0 0 0 4 22 Z" fill="var(--oh-danger)" />
        </svg>
        <div className="text-[14px]">
          <div className="font-semibold text-[var(--oh-text)]">Raw Events</div>
          <div className="mb-3 text-[var(--oh-text-secondary)]">9</div>
          <div className="font-semibold text-[var(--oh-text)]">Patterns Detected</div>
          <div className="text-[var(--oh-text-secondary)]">0</div>
        </div>
      </div>

      <AdminEmptyHero
        icon={<ShieldCheckIcon size={80} strokeWidth={1.5} />}
        title="No Patterns Found"
        description="No abnormal patterns detected!"
      />

      <div className="mt-8 flex items-end justify-between">
        <h2 className="text-[15px] font-semibold text-[var(--oh-text)]">Events</h2>
        <FilterSelect label="Filters" placeholder="Select…" />
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-[var(--oh-border)]">
        <div className="flex bg-[var(--oh-primary)] text-[12px] font-semibold uppercase tracking-wide text-white">
          {["Timestamp", "Event", "User", "Outlet", "Register", "Device"].map((c) => (
            <div key={c} className="flex-1 px-4 py-3 text-center">{c}</div>
          ))}
        </div>
      </div>
    </AdminPageLayout>
  );
}
