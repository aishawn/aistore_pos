import Link from "next/link";
import { ArrowRight, BellOff, Boxes, CircleAlert, Printer, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { RegisterSettingsScaffold } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/sell-screen";

const sellBehaviors = [
  {
    title: "Login after sale and training mode",
    status: "Not configured",
    detail: "The Orithos register does not prompt for a new Orithos login after checkout or provide a training-mode switch.",
    icon: ShieldCheck,
  },
  {
    title: "Cash drawer",
    status: "Local setup",
    detail: "Orithos has not verified a drawer connection or open signal for this terminal. This preference cannot control the device.",
    icon: Wallet,
    action: { label: "View hardware status", href: "/settings/hardware" },
  },
  {
    title: "Receipt and Tyro printing",
    status: "Manual print",
    detail: "Receipts can be printed from the sale confirmation or sales history. Refund receipts are not printed automatically, and Tyro integrated receipts are not connected.",
    icon: Printer,
    action: { label: "View receipt status", href: "/settings/receipts" },
  },
  {
    title: "Product consolidation",
    status: "Automatic",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    detail: "Adding the same product with the same pack size increases its quantity. Each and Case selections remain separate cart lines.",
    icon: Boxes,
  },
  {
    title: "Close discrepancy notes",
    status: "Cash count only",
    detail: "Closing a cash-enabled session requires a counted cash amount. The current close flow does not require a note when totals differ.",
    icon: ReceiptText,
    action: { label: "Open Close Register", href: "/close" },
  },
  {
    title: "Promotion calculation",
    status: "No background setting",
    detail: "The Orithos checkout quote gets product prices and taxes from Orithos. There is no separate register preference for running promotion calculations in a thread.",
    icon: BellOff,
  },
];

export default function RegisterSellScreenSettingsPage() {
  return (
    <RegisterSettingsScaffold
      subSectionTitle="Sell Screen"
      activeHref={HREF}
      showRegisterSelector={false}
      showSearch={false}
      showSave={false}
    >
      <div className="mx-auto w-full max-w-5xl">
        <section role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-200">
            <CircleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-sky-950">Register behaviour is not configured with these switches</h2>
            <p className="mt-1 text-sm leading-5 text-sky-900/80">
              The previous options were static examples. These cards describe the current Orithos Sell experience and the controls that are available.
            </p>
          </div>
        </section>

        <section aria-labelledby="sell-screen-behavior-heading" className="mt-6">
          <div className="mb-3">
            <h2 id="sell-screen-behavior-heading" className="text-sm font-semibold text-[var(--oh-text)]">Sell screen behaviour</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Checkout, device and receipt behaviour for this pilot</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {sellBehaviors.map(({ title, status, tone, detail, icon: Icon, action }) => (
              <li key={title} className="flex min-w-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${tone ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
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
