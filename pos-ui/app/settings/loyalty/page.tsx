import { BadgeDollarSign, Coins, Mail, Wallet, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const loyaltySettings: {
  title: string;
  detail: string;
  status: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Earn rate",
    detail: "The displayed 1 point per dollar is an example, not a saved rate.",
    status: "Sample value",
    icon: Coins,
  },
  {
    title: "Redemption value",
    detail: "The displayed 100 points = $1.00 is an example, not a saved rate.",
    status: "Sample value",
    icon: BadgeDollarSign,
  },
  {
    title: "Partial redemption",
    detail: "This screen does not load or save a partial redemption policy.",
    status: "Not connected",
    icon: Wallet,
  },
  {
    title: "Balance notifications",
    detail: "No customer balance message or delivery channel is configured here.",
    status: "Not connected",
    icon: Mail,
  },
];

export default function LoyaltyPage() {
  return (
    <AdminPageLayout
      title="Loyalty Settings"
      subtitle="Earn rates, redemptions, and customer balance status"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-200">
          <Coins size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-sky-950">These loyalty rules are not connected to this screen</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-900/80">
            The switches and rates previously shown were examples. This page does not load or save loyalty rules; customer point balances are stored separately on customer records.
          </p>
        </div>
      </section>

      <section aria-labelledby="loyalty-status-title" className="mt-6">
        <div className="mb-3">
          <h2 id="loyalty-status-title" className="text-sm font-semibold text-[var(--oh-text)]">Configuration status</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">No active earning or redemption rules are confirmed here</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {loyaltySettings.map(({ title, detail, status, icon: Icon }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
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
