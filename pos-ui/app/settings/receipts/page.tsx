export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Mail, Printer, ReceiptText, Sparkles, TriangleAlert } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { DevicesSettingsTabs } from "@/components/admin/SetupHubTabs";

const receiptCapabilities = [
  {
    title: "Automatic printing",
    detail: "A receipt printer has not been connected or verified on this terminal.",
    status: "Needs local setup",
    icon: Printer,
    tone: "amber",
  },
  {
    title: "Email receipts",
    detail: "Email delivery is unavailable because SMTP is not configured.",
    status: "Unavailable",
    icon: Mail,
    tone: "slate",
  },
  {
    title: "Paper size and layout",
    detail: "Receipt formatting is not configured in Orithos yet.",
    status: "Not configured",
    icon: ReceiptText,
    tone: "slate",
  },
  {
    title: "Tax breakdown",
    detail: "Checkout calculates GST from Odoo. The printed receipt breakdown has not been verified.",
    status: "Checkout ready",
    icon: Sparkles,
    tone: "green",
  },
] as const;

const statusStyles = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export default function ReceiptsPage() {
  return (
    <AdminPageLayout
      title="Receipt Settings"
      subtitle="Receipt delivery and formatting for this POS"
      toolbar={<DevicesSettingsTabs activeHref="/settings/receipts" />}
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm ring-1 ring-amber-200/80">
          <TriangleAlert size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-950">Receipt delivery is not connected</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900/80">
            Earlier values on this page were examples. Orithos does not currently save receipt preferences or apply them to Odoo, a printer, or email delivery.
          </p>
        </div>
      </section>

      <section aria-labelledby="receipt-capabilities-title" className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="receipt-capabilities-title" className="text-sm font-semibold text-[var(--oh-text)]">Current capabilities</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">What is available and what still needs setup</p>
          </div>
          <span className="rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-muted)] ring-1 ring-[var(--oh-border)]">4 items</span>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {receiptCapabilities.map(({ title, detail, status, icon: Icon, tone }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] transition-shadow hover:shadow-sm sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[tone]}`}>
                    {status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AdminPageLayout>
  );
}
