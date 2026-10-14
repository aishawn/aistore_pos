import Link from "next/link";
import { ArrowRight, CalendarClock, CreditCard, SlidersHorizontal } from "lucide-react";
import { OutletSettingsScaffold } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/gift-cards";

const giftCardBehaviors = [
  {
    title: "Gift card checkout",
    status: "Not in Odoo pilot",
    detail: "The Odoo Sell checkout does not currently issue or redeem gift cards. The old enabled switch did not connect gift cards to this register.",
    icon: CreditCard,
  },
  {
    title: "Expiry defaults",
    status: "Not applied",
    detail: "The previous three-year expiry value was an example. Odoo checkout does not read an outlet-level gift card expiry preference from this page.",
    icon: CalendarClock,
  },
  {
    title: "Manual expiry changes",
    status: "Not available",
    detail: "The former adjustment switch did not enable an expiry editing flow for Odoo gift cards.",
    icon: SlidersHorizontal,
  },
];

export default function OutletGiftCardsSettingsPage() {
  return (
    <OutletSettingsScaffold
      subSectionTitle="Gift Cards"
      activeHref={HREF}
      showOutletSelector={false}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <CreditCard size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Gift cards are not connected to the Odoo pilot</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous enabled and expiry values were static examples. They do not change the current checkout.
            </p>
          </div>
        </section>

        <section aria-labelledby="gift-card-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="gift-card-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Gift card availability</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Current checkout support and expiry behaviour</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {giftCardBehaviors.map(({ title, status, detail, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
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
                  <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/settings/company/outlets"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            View pilot outlet behaviour <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </OutletSettingsScaffold>
  );
}
