import Link from "next/link";
import { ArrowRight, Boxes, CircleAlert, SlidersHorizontal } from "lucide-react";
import { OutletSettingsScaffold } from "@/components/admin/OutletSettingsScaffold";

const HREF = "/settings/outlets/transfers";

const transferBehaviors = [
  {
    title: "Internal stock transfers",
    status: "Managed in Odoo",
    detail: "The Orithos Odoo pilot does not currently create or receive internal stock transfers. The available transfer form belongs to the legacy workflow.",
    icon: Boxes,
  },
  {
    title: "Update last cost on receipt",
    status: "Not configured here",
    detail: "The previous enabled switch was a static example. It does not change cost values when stock is received; use the inventory valuation and costing rules configured for the product in Odoo.",
    icon: SlidersHorizontal,
  },
];

export default function OutletTransfersSettingsPage() {
  return (
    <OutletSettingsScaffold
      subSectionTitle="Transfers"
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
            <h2 className="text-sm font-semibold text-sky-950">Transfer preferences are not connected to Odoo</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous toggle did not set receiving or costing behaviour. Current pilot support is shown below.
            </p>
          </div>
        </section>

        <section aria-labelledby="transfer-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="transfer-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Transfer behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">How inventory transfers and receipt costs are handled</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {transferBehaviors.map(({ title, status, detail, icon: Icon }) => (
              <li key={title} className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
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
              </li>
            ))}
          </ul>
          <Link
            href="/settings/company/integrations"
            className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--oh-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            Check Odoo connection <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </OutletSettingsScaffold>
  );
}
