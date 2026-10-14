import Link from "next/link";
import { ArrowRight, CreditCard, Monitor, ShieldAlert } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/outlets";

const outletBehaviors = [
  {
    title: "Parked sales",
    status: "This terminal",
    icon: Monitor,
    description: "Parked sales are stored in this browser and filtered to the signed-in Odoo user and selected company. The same user can resume them on another register in this browser, but they do not sync to another device.",
    action: { label: "Open Sell and view Parked", href: "/" },
  },
  {
    title: "Gift cards",
    status: "Not in Odoo pilot",
    icon: CreditCard,
    description: "Gift card pages and imports belong to the Classic module. The Odoo Sell checkout does not currently offer gift card redemption, and this switch does not enable it.",
  },
];

export default function OutletsCompanySettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Outlets"
      activeHref={HREF}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <ShieldAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Outlet sharing is not controlled by these switches</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous “on” values were examples. Here is how parked sales and gift cards work in the current pilot.
            </p>
          </div>
        </section>

        <section aria-labelledby="outlet-data-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="outlet-data-heading" className="text-sm font-semibold text-[var(--oh-text)]">Outlet data scope</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Storage and checkout availability for each feature</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {outletBehaviors.map(({ title, status, icon: Icon, description, action }) => (
              <li key={title} className="flex min-w-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                        {status}
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
      </div>
    </CompanySettingsScaffold>
  );
}
