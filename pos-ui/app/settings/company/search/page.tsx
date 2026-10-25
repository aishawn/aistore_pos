export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ArrowRight, Database, PackageSearch, Search, UserRoundSearch } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/search";

const searchBehaviors = [
  {
    title: "Products",
    value: "Name · barcode · SKU",
    detail: "Product search matches the Orithos product name, barcode, or internal reference. The catalogue and register search Orithos directly.",
    icon: PackageSearch,
  },
  {
    title: "Customers",
    value: "Name · phone · email · reference",
    detail: "Customer lookup searches Orithos by name, phone number, email, or customer reference, including the customer picker at checkout.",
    icon: UserRoundSearch,
  },
  {
    title: "Search storage",
    value: "Live Orithos query",
    detail: "Search requests are sent to Orithos when you search. The previous “Local Database” value was not connected to a saved cache preference.",
    icon: Database,
  },
];

export default function SearchSettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Search"
      activeHref={HREF}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <Search size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Search preferences are not edited here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous selectors were examples. Search fields and data source are defined by the live Orithos search used across Orithos.
            </p>
          </div>
        </section>

        <section aria-labelledby="search-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="search-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Current search behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Product and customer results come from your connected Orithos account</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {searchBehaviors.map(({ title, value, detail, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                    <span className="inline-flex max-w-full items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium leading-4 text-slate-700 ring-1 ring-inset ring-slate-200">
                      {value}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href="/products"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              Browse products <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link
              href="/customers"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              Browse customers <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </CompanySettingsScaffold>
  );
}
