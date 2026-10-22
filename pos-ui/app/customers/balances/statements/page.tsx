import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export default function CustomerStatementsRoute() {
  return (
    <AdminPageLayout title="Statements" subtitle="Open invoices from Odoo customer balances">
      <section role="status" className="rounded-xl border border-[var(--oh-border)] bg-white p-5 sm:p-6">
        <h2 className="font-semibold text-[var(--oh-text)]">Open invoices live under Balances</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--oh-muted)]">
          Select a customer on the Balances page to view posted open invoices and residual amounts from Odoo.
          Classic statement templates are not used as a live source of truth.
        </p>
        <Link href="/customers/balances" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
          Open balances <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </section>
    </AdminPageLayout>
  );
}
