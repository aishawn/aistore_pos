import Link from "next/link";
import { ArrowRight, Boxes, Package, ShieldAlert } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/general-display";

const displaySources = [
  {
    title: "Product unit name",
    source: "Odoo product data",
    description: "Sell reads each product’s unit of measure from its Odoo product record. The old “Single text” example did not override it.",
    icon: Package,
    link: { label: "Review product catalogue", href: "/products/odoo" },
  },
  {
    title: "Each and case options",
    source: "Fixed in Sell",
    description: "The register currently offers Each and case quantities of 6, 12, and 24. The old “Case text” field did not change these options.",
    icon: Boxes,
    link: { label: "Open Sell", href: "/" },
  },
];

export default function GeneralDisplaySettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="General Display"
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
            <h2 className="text-sm font-semibold text-sky-950">Display labels are not configured here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The text fields previously shown were examples only. Current product and pack labels come from the sources below.
            </p>
          </div>
        </section>

        <section aria-labelledby="display-source-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="display-source-heading" className="text-sm font-semibold text-[var(--oh-text)]">What controls the display</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">The product unit and register pack selector use separate sources</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {displaySources.map(({ title, source, description, icon: Icon, link }) => (
              <li key={title} className="flex min-w-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                        {source}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{description}</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-[var(--oh-border)] pt-3 sm:pl-[52px]">
                  <Link
                    href={link.href}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                  >
                    {link.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </CompanySettingsScaffold>
  );
}
