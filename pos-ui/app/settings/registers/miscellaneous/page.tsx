import Link from "next/link";
import { ArrowRight, Keyboard, LayoutPanelLeft, ShieldAlert } from "lucide-react";
import { RegisterSettingsScaffold } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/miscellaneous";

const registerBehaviors = [
  {
    title: "Sale key set",
    status: "Not used by Odoo Sell",
    detail: "The pilot register browses Odoo products with search and categories. The sale-key sets page applies only to the legacy register workflow.",
    icon: Keyboard,
    action: { label: "View legacy sale keys", href: "/settings/keys" },
  },
  {
    title: "Sale key position",
    status: "No key panel",
    detail: "There are no sale-key tiles to place on the left or right. Product browsing and the cart use the current Odoo Sell layout.",
    icon: LayoutPanelLeft,
    action: { label: "Open Sell", href: "/" },
  },
];

export default function RegisterMiscellaneousSettingsPage() {
  return (
    <RegisterSettingsScaffold
      subSectionTitle="Miscellaneous"
      activeHref={HREF}
      showRegisterSelector={false}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <ShieldAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Register layout preferences are not saved here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous sale-key selectors were static examples and do not change the Odoo Sell screen.
            </p>
          </div>
        </section>

        <section aria-labelledby="register-misc-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="register-misc-heading" className="text-sm font-semibold text-[var(--oh-text)]">Register layout</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">How product shortcuts and navigation work in the pilot</p>
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
                <div className="mt-4 border-t border-[var(--oh-border)] pt-3 sm:pl-[52px]">
                  <Link
                    href={action.href}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                  >
                    {action.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </RegisterSettingsScaffold>
  );
}
