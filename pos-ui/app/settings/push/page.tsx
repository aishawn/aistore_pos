export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { Bell, CalendarDays, Mail, Package, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";

const notificationOptions: {
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Low-stock alerts",
    detail: "This page does not store a stock alert rule or monitor stock thresholds.",
    icon: Package,
  },
  {
    title: "End-of-day summary",
    detail: "No summary schedule or recipient is configured here.",
    icon: CalendarDays,
  },
  {
    title: "Refund notifications",
    detail: "A refund alert trigger and delivery route are not configured here.",
    icon: RotateCcw,
  },
  {
    title: "Email and push delivery",
    detail: "This page does not register a push device or configure email delivery.",
    icon: Mail,
  },
];

export default function PushNotificationsPage() {
  return (
    <AdminPageLayout
      title="Push Notifications"
      subtitle="Alert and delivery status for this POS"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-tile-orange-text)] shadow-sm ring-1 ring-[var(--oh-tile-orange-border)]">
          <TriangleAlert size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--oh-tile-orange-text)]">Notification preferences are not connected</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--oh-tile-orange-text)] opacity-90">
            The switches and delivery channel previously shown here were examples. This page does not save alert preferences or send notifications.
          </p>
        </div>
      </section>

      <section aria-labelledby="notification-status-title" className="mt-6">
        <div className="mb-3">
          <h2 id="notification-status-title" className="text-sm font-semibold text-[var(--oh-text)]">Notification options</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Current configuration status</p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {notificationOptions.map(({ title, detail, icon: Icon }) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                    <Bell size={12} aria-hidden="true" /> Not configured
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
