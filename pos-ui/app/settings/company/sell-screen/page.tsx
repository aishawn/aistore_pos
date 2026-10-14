import Link from "next/link";
import {
  ArrowRight,
  Keyboard,
  ListFilter,
  PackageCheck,
  Percent,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/sell-screen";

const registerBehaviors = [
  {
    title: "Product details in the cart",
    status: "Visible",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    description: "Added products show their name, price, quantity, and selected Each or Case pack in the cart.",
    icon: PackageCheck,
  },
  {
    title: "Selected customer",
    status: "Name shown",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    description: "The cart header shows the selected customer’s name. Phone and email appear while choosing a customer from search results.",
    icon: UserRound,
  },
  {
    title: "Product search",
    status: "Query retained",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
    description: "Search supports names, barcodes, and codes. Choosing a product keeps the current search results in view.",
    icon: Search,
  },
  {
    title: "Search result paging",
    status: "50 per query",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
    description: "The register requests up to 50 products at a time. There is no pagination preference on this page.",
    icon: ListFilter,
  },
  {
    title: "Keep focus on the register",
    status: "Not configured",
    tone: "bg-slate-50 text-slate-700 ring-slate-200",
    description: "This screen does not prevent normal focus changes or lock the register when focus moves elsewhere.",
    icon: Keyboard,
  },
  {
    title: "Discount reason prompt",
    status: "Not configured",
    tone: "bg-slate-50 text-slate-700 ring-slate-200",
    description: "The Orithos Sell flow does not expose a discount-reason preference or prompt here.",
    icon: Percent,
  },
];

export default function SellScreenSettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Sell Screen / Register"
      activeHref={HREF}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
              <ShieldAlert size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-sky-950">Register preferences are not configured here</h2>
              <p className="mt-1 text-sm leading-5 text-sky-900/80">
                The previous switches were examples only. This page did not save or apply them to checkout.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            Open Sell <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="register-behaviors-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="register-behaviors-heading" className="text-sm font-semibold text-[var(--oh-text)]">Current register behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">What the Orithos pilot Sell screen does today</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {registerBehaviors.map(({ title, status, tone, description, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}>
                      {status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </CompanySettingsScaffold>
  );
}
