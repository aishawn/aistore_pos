import Link from "next/link";
import { ArrowRight, Banknote, CircleDollarSign, Languages, ShieldAlert } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/currency";

const currencyBehaviors = [
  {
    title: "Currency",
    value: "AUD",
    detail: "The sell screen formats prices as Australian dollars. Currency display is currently fixed in the application, rather than a company preference on this page.",
    icon: CircleDollarSign,
  },
  {
    title: "Number format",
    value: "en-AU",
    detail: "Prices use Australian number and currency formatting, including the local dollar symbol and decimal separators.",
    icon: Languages,
  },
  {
    title: "Cash rounding",
    value: "Register setting",
    detail: "Odoo checkout applies the selected POS register’s rounding rule when enabled, and can limit it to cash. The legacy checkout path rounds cash to the nearest $0.05.",
    icon: Banknote,
  },
];

export default function CurrencySettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Currency"
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
            <h2 className="text-sm font-semibold text-sky-950">Currency preferences are not edited here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous fields were static examples. Currency and number display are currently set by the application; cash rounding follows the active checkout configuration.
            </p>
          </div>
        </section>

        <section aria-labelledby="currency-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="currency-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Current currency behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Australian dollar pricing across the sell screen and checkout</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {currencyBehaviors.map(({ title, value, detail, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                  <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                      {value}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            Open the sell screen <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </CompanySettingsScaffold>
  );
}
