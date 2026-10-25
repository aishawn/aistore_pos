export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { AlertTriangle, CalendarDays, CreditCard, Percent, ReceiptText, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const surchargeSettings: {
  title: string;
  detail: string;
  status: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Surcharge activation",
    detail: "This page does not load an enabled or disabled state for the current register.",
    status: "Not linked",
    icon: CreditCard,
  },
  {
    title: "Card fee calculation",
    detail: "The percentage option is a sample; no calculation rule is saved here.",
    status: "Not configured",
    icon: Percent,
  },
  {
    title: "Public holiday rate",
    detail: "The displayed 15% is a placeholder, not a saved calendar rule.",
    status: "Sample value",
    icon: CalendarDays,
  },
  {
    title: "Receipt disclosure",
    detail: "The previous switch was a visual example and does not control receipt output.",
    status: "Not linked",
    icon: ReceiptText,
  },
];

export default function SurchargingPage() {
  return (
    <AdminPageLayout
      title="Surcharging"
      subtitle="Surcharge rule status for this POS"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-tile-orange-text)] shadow-sm ring-1 ring-[var(--oh-tile-orange-border)]">
          <AlertTriangle size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--oh-tile-orange-text)]">Surcharge settings are not connected here</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--oh-tile-orange-text)] opacity-90">
            The rates and switches previously shown were examples. This page does not load or save surcharge rules, and its values do not change checkout totals.
          </p>
        </div>
      </section>

      <section aria-labelledby="surcharge-status-title" className="mt-6">
        <div className="mb-3">
          <h2 id="surcharge-status-title" className="text-sm font-semibold text-[var(--oh-text)]">Configuration status</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">No active surcharge rule is confirmed by this screen</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {surchargeSettings.map(({ title, detail, status, icon: Icon }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{status}</span>
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
