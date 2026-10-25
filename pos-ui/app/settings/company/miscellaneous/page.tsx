import Link from "next/link";
import { ArrowRight, Bell, Bug, FileText, Keyboard, Mail, UsersRound } from "lucide-react";
import { CompanySettingsScaffold } from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/miscellaneous";

const companyBehaviors = [
  {
    title: "Sale keys and position",
    status: "Not in Orithos pilot",
    detail: "The pilot register uses the Orithos catalogue, search, and pack options. The old sale-key layout does not change this screen.",
    icon: Keyboard,
    action: { label: "Open Sell", href: "/" },
  },
  {
    title: "Price change notifications",
    status: "Not configured",
    detail: "There is no company-level notification preference or alert workflow connected to this switch.",
    icon: Bell,
  },
  {
    title: "Statement reply-to email",
    status: "Not configured",
    detail: "This field did not set an email address. Customer statements can be previewed and printed; automatic statement email is not configured here.",
    icon: Mail,
    action: { label: "Open customer balances", href: "/customers/balances" },
  },
  {
    title: "Average cost visibility",
    status: "Not configured",
    detail: "The previous toggle does not control editor visibility. Product imports can include a cost value, but there is no company-level display preference here.",
    icon: FileText,
  },
  {
    title: "New staff reporting access",
    status: "Assigned by role",
    detail: "There is no global default that grants reporting access to every outlet. Manage each staff account and its role directly.",
    icon: UsersRound,
    action: { label: "Manage users and roles", href: "/settings/users" },
  },
  {
    title: "Debug logging level",
    status: "Server managed",
    detail: "Logging is not controlled by a company preference in Orithos. The previous selector did not change application logging.",
    icon: Bug,
  },
];

export default function MiscellaneousSettingsPage() {
  return (
    <CompanySettingsScaffold
      subSectionTitle="Miscellaneous"
      activeHref={HREF}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <Bug size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">These company preferences are not saved in Orithos</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous controls were static examples. Here is where the related features are managed in the current pilot.
            </p>
          </div>
        </section>

        <section aria-labelledby="company-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="company-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Company behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Current feature status and the right place to manage it</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {companyBehaviors.map(({ title, status, detail, icon: Icon, action }) => (
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
    </CompanySettingsScaffold>
  );
}
