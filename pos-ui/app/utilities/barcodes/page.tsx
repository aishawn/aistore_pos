export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import Link from "next/link";
import { ArrowUpRight, PackageSearch, Printer, Ruler, ScanLine, TriangleAlert, type LucideIcon } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const barcodeSteps: {
  title: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Choose products",
    detail: "The product picker is not connected to the live catalogue on this page.",
    icon: PackageSearch,
  },
  {
    title: "Choose a label",
    detail: "EAN-13 and 40 × 28 mm were sample values, not saved templates.",
    icon: Ruler,
  },
  {
    title: "Print labels",
    detail: "No label document is generated or sent to a printer by this page.",
    icon: Printer,
  },
];

export default function BarcodesPage() {
  return (
    <AdminPageLayout
      title="Barcodes"
      subtitle="Barcode label generation status"
    >
      <section
        role="status"
        className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 sm:p-5"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm ring-1 ring-amber-200/80">
          <TriangleAlert size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-950">Barcode label printing is not connected</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-900/80">
            The selectors and “Generate &amp; Print” button previously shown here were visual placeholders. This page does not load products, create labels, or send print jobs.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/products/odoo" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
              Open Odoo product catalogue <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-950 hover:bg-amber-100">
              Integration status
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="barcode-process-title" className="mt-6">
        <div className="mb-3">
          <h2 id="barcode-process-title" className="text-sm font-semibold text-[var(--oh-text)]">Label workflow</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">The steps required to generate and print labels</p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {barcodeSteps.map(({ title, detail, icon: Icon }, index) => (
            <li key={title} className="flex min-w-0 gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <span className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[var(--oh-primary)] text-[10px] font-semibold text-white ring-2 ring-white">{index + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h3>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                    <ScanLine size={12} aria-hidden="true" /> Unavailable
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </AdminPageLayout>
  );
}
