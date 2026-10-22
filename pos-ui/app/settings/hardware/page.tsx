import { Info, Monitor, Printer, ScanBarcode, Wallet, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { DevicesSettingsTabs } from "@/components/admin/SetupHubTabs";

const devices: {
  name: string;
  detail: string;
  status: string;
  icon: LucideIcon;
  statusTone: "amber" | "slate";
}[] = [
  {
    name: "Receipt printer",
    detail: "A connection and test print have not been confirmed on this terminal.",
    status: "Not verified",
    icon: Printer,
    statusTone: "amber",
  },
  {
    name: "Cash drawer",
    detail: "A drawer connection and open signal have not been confirmed.",
    status: "Not verified",
    icon: Wallet,
    statusTone: "amber",
  },
  {
    name: "Barcode scanner",
    detail: "Scanner input has not been tested on this terminal.",
    status: "Not tested",
    icon: ScanBarcode,
    statusTone: "slate",
  },
  {
    name: "Customer display",
    detail: "A display connection has not been configured or verified.",
    status: "Not verified",
    icon: Monitor,
    statusTone: "amber",
  },
];

const statusStyles = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-50 text-slate-700 ring-slate-200",
};

export default function HardwarePage() {
  return (
    <AdminPageLayout
      title="Hardware"
      subtitle="Peripheral status for this POS terminal"
      toolbar={<DevicesSettingsTabs activeHref="/settings/hardware" />}
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-200">
          <Info size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-sky-950">Hardware setup is local to this terminal</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-sky-900/80">
            Orithos has not detected or verified these devices. Connect and test peripherals on the POS terminal; this page does not configure them through Odoo.
          </p>
        </div>
      </section>

      <section aria-labelledby="hardware-devices-title" className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="hardware-devices-title" className="text-sm font-semibold text-[var(--oh-text)]">Devices</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Connection checks for the current register</p>
          </div>
          <span className="rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-muted)] ring-1 ring-[var(--oh-border)]">4 devices</span>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          {devices.map(({ name, detail, status, icon: Icon, statusTone }) => (
            <li key={name} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] transition-shadow hover:shadow-sm sm:p-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{name}</h3>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${statusStyles[statusTone]}`}>
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
