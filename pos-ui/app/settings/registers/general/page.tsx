import Link from "next/link";
import { ArrowRight, Banknote, CreditCard, ReceiptText, Sun, TriangleAlert } from "lucide-react";
import { RegisterSettingsScaffold } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/general";

const registerBehaviors = [
  {
    title: "Safe drop alert",
    status: "Not in Odoo pilot",
    detail: "The previous zero-dollar value did not set a drawer threshold. Orithos does not currently provide a safe-drop alert in the Odoo register flow.",
    icon: Banknote,
  },
  {
    title: "Default payment method",
    status: "Odoo POS config",
    detail: "Available payment methods come from the active Odoo POS configuration. The cashier selects a method at checkout; this page does not set a default.",
    icon: CreditCard,
    action: { label: "Check Odoo connection", href: "/settings/company/integrations" },
  },
  {
    title: "Receipt template",
    status: "Not connected",
    detail: "The previous “Receipt” selection was not saved or applied to checkout. Receipt printing and email delivery still need setup.",
    icon: ReceiptText,
    action: { label: "View receipt status", href: "/settings/receipts" },
  },
  {
    title: "Colour scheme",
    status: "Light theme",
    detail: "Orithos currently uses its shared light interface. The old selector did not enable dark mode or device-based theme switching.",
    icon: Sun,
  },
];

export default function RegisterGeneralSettingsPage() {
  return (
    <RegisterSettingsScaffold
      subSectionTitle="General"
      activeHref={HREF}
      showRegisterSelector={false}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <TriangleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Register preferences are not saved here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous register selector and field values were static examples. Current payment, receipt and display behaviour is shown below.
            </p>
          </div>
        </section>

        <section aria-labelledby="register-general-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="register-general-heading" className="text-sm font-semibold text-[var(--oh-text)]">Register behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Current settings and capabilities in the Odoo POS pilot</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {registerBehaviors.map(({ title, status, detail, icon: Icon, action }) => (
              <li key={title} className="flex min-w-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
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
    </RegisterSettingsScaffold>
  );
}
