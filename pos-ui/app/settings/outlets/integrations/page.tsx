import Link from "next/link";
import { ArrowRight, CircleAlert, Database, Mail, ReceiptText } from "lucide-react";
import { OutletSettingsScaffold } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/integrations";

const outletBehaviors = [
  {
    title: "Cost source",
    status: "Orithos data",
    detail: "The previous “Use global cost” switch was not saved. Orithos is the source for pilot products; imports may include a product cost when supplied.",
    icon: Database,
    action: { label: "Open Orithos connection", href: "/settings/company/integrations" },
  },
  {
    title: "Receipt template",
    status: "Not connected",
    detail: "This outlet does not load or save a receipt template. Receipt layout and delivery are not yet connected to the Orithos checkout.",
    icon: ReceiptText,
    action: { label: "View receipt status", href: "/settings/receipts" },
  },
  {
    title: "Outlet email",
    status: "Not configured",
    detail: "The address previously shown was an example, not a saved outlet contact. Email receipt delivery is unavailable until SMTP is configured.",
    icon: Mail,
    action: { label: "View receipt status", href: "/settings/receipts" },
  },
];

export default function OutletIntegrationsSettingsPage() {
  return (
    <OutletSettingsScaffold
      subSectionTitle="Integrations"
      activeHref={HREF}
      showOutletSelector={false}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <CircleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Outlet integration preferences are not saved here</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous outlet selector and field values were static examples. Current data and receipt capabilities are shown below.
            </p>
          </div>
        </section>

        <section aria-labelledby="outlet-integration-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="outlet-integration-heading" className="text-sm font-semibold text-[var(--oh-text)]">Outlet integrations</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Data source, receipt settings and contact details for this pilot</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {outletBehaviors.map(({ title, status, detail, icon: Icon, action }) => (
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
    </OutletSettingsScaffold>
  );
}
