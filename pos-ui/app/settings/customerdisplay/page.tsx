import Link from "next/link";
import { ArrowRight, Image, MonitorOff, Palette, ReceiptText, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const displayCapabilities: {
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Customer-facing screen",
    detail: "Orithos does not currently open a second screen for customers.",
    icon: MonitorOff,
  },
  {
    title: "Live sale total",
    detail: "The running total is not sent to a separate customer display.",
    icon: ReceiptText,
  },
  {
    title: "Promotional media",
    detail: "There is no media playlist or promotional screen to manage here.",
    icon: Image,
  },
  {
    title: "Screen appearance",
    detail: "Display themes and idle screens are not saved or applied by Orithos.",
    icon: Palette,
  },
];

export default function CustomerDisplayPage() {
  return (
    <AdminPageLayout
      title="Customer Display"
      subtitle="Customer-facing screen status for this POS"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-200">
          <MonitorOff size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-sky-950">Customer display is not available in this pilot</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-900/80">
            The switches and selections previously shown here were examples. Orithos does not save these preferences or open a customer-facing screen.
          </p>
        </div>
      </section>

      <section aria-labelledby="display-capabilities-title" className="mt-6">
        <div className="mb-3">
          <h2 id="display-capabilities-title" className="text-sm font-semibold text-[var(--oh-text)]">Display capabilities</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">What this register currently provides</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {displayCapabilities.map(({ title, detail, icon: Icon }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">Unavailable</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/settings/hardware"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-primary)] shadow-[var(--oh-shadow-card)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
      >
        Check peripheral status <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </AdminPageLayout>
  );
}
