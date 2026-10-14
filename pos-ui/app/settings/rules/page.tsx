import Link from "next/link";
import { ArrowRight, Clock3, LayoutDashboard, ShieldAlert, ShieldCheck } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const ruleStatuses = [
  {
    title: "Refund reasons",
    description: "The previous switch was an example only. This page does not save a rule or require a reason during refunds.",
    icon: ShieldAlert,
    action: { label: "Review sales history", href: "/history/odoo" },
  },
  {
    title: "Manager approval for voids",
    description: "No approval preference is loaded here, so the previous enabled state did not enforce a manager check.",
    icon: ShieldCheck,
  },
  {
    title: "Default landing page",
    description: "A default destination is not stored by this page. Use the main navigation to open the workspace you need.",
    icon: LayoutDashboard,
    action: { label: "Open Sell", href: "/" },
  },
  {
    title: "Lock after inactivity",
    description: "This page does not configure an idle timeout or automatically lock the register.",
    icon: Clock3,
  },
];

export default function PageRulesPage() {
  return (
    <AdminPageLayout
      title="Page Rules"
      subtitle="Checkout behaviour and access controls"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
          <ShieldAlert size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-sky-950">These rules are not configured here</h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-sky-900/80">
            The controls previously shown on this page were static examples. They did not save preferences or enforce checkout rules.
          </p>
        </div>
      </section>

      <section aria-labelledby="rule-status-heading" className="mt-6">
        <div className="mb-3">
          <h2 id="rule-status-heading" className="text-sm font-semibold text-[var(--oh-text)]">Rule status</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Current limits of the Orithos pilot settings screen</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ruleStatuses.map(({ title, description, icon: Icon, action }) => (
            <li key={title} className="flex min-w-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                      Not configured here
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{description}</p>
                </div>
              </div>
              {action && (
                <div className="mt-4 border-t border-[var(--oh-border)] pt-3 sm:pl-[52px]">
                  <Link
                    href={action.href}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                  >
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </AdminPageLayout>
  );
}
