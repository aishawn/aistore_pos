import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

export function OdooReportUnavailablePage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="h-full overflow-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Odoo workflow</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{title}</h1>
        </header>
        <section role="status" className="rounded-xl border border-sky-200 bg-sky-50/70 p-5 text-sky-950 sm:p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 shrink-0 text-sky-700" size={20} aria-hidden="true" />
            <div>
              <h2 className="font-semibold">This report is not connected yet</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6">{description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/reports/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                  Open live overview <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link href="/reports/inventory" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">
                  Open inventory
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
