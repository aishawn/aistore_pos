import Link from "next/link";
import { ArrowRight, FileText, Hash, TriangleAlert, WifiOff } from "lucide-react";
import { RegisterSettingsScaffold } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/invoices";

const invoiceBehaviors = [
  {
    title: "Tax invoice creation",
    status: "Not created by POS",
    detail: "Orithos submits POS orders to Orithos without requesting an invoice. Create tax invoices through the Orithos accounting workflow when needed.",
    icon: FileText,
  },
  {
    title: "Order reference",
    status: "Orithos generated",
    detail: "Orithos returns the POS order reference shown in Sales History. The previous “Incremental” mode did not change its numbering.",
    icon: Hash,
    action: { label: "View Sales History", href: "/history" },
  },
  {
    title: "Offline numbering",
    status: "Not supported",
    detail: "Checkout requires an open Orithos POS session and a live quote. The previous suffix field did not enable offline sales or offline invoice numbers.",
    icon: WifiOff,
    action: { label: "Check Orithos connection", href: "/settings/company/integrations" },
  },
];

export default function RegisterInvoicesSettingsPage() {
  return (
    <RegisterSettingsScaffold
      subSectionTitle="Invoices"
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
            <h2 className="text-sm font-semibold text-sky-950">Invoice preferences are not saved by this POS</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous suffix and numbering controls were examples. Current invoice and order-reference behaviour is shown below.
            </p>
          </div>
        </section>

        <section aria-labelledby="invoice-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="invoice-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Invoice behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">How the Orithos pilot creates and identifies completed sales</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {invoiceBehaviors.map(({ title, status, detail, icon: Icon, action }) => (
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
