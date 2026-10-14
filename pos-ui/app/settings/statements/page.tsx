import Link from "next/link";
import { ArrowRight, CalendarDays, FileText, Mail, UsersRound, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const unavailableSettings: {
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Statement cycle and due terms",
    detail: "The monthly cycle and 30-day terms previously shown were examples, not saved settings.",
    icon: CalendarDays,
  },
  {
    title: "Automatic email",
    detail: "This page does not schedule statement emails or configure their delivery.",
    icon: Mail,
  },
  {
    title: "Zero-balance customers",
    detail: "No include-or-exclude preference for zero-balance customers is loaded here.",
    icon: UsersRound,
  },
];

export default function StatementsPage() {
  return (
    <AdminPageLayout
      title="Statements"
      subtitle="Customer statement previews and delivery status"
    >
      <section
        role="status"
        className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-200">
            <FileText size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-sky-950">Statement previews are available</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-sky-900/80">
              Preview a date range, choose a statement template, and print customer balances and activity from Customer Balances.
            </p>
          </div>
        </div>
        <Link
          href="/customers/balances"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          Open customer balances <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="statement-settings-title" className="mt-6">
        <div className="mb-3">
          <h2 id="statement-settings-title" className="text-sm font-semibold text-[var(--oh-text)]">Automatic statement settings</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">These preferences are not connected to this page</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {unavailableSettings.map(({ title, detail, icon: Icon }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">Not configured</span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AdminPageLayout>
  );
}
