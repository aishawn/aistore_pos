import Link from "next/link";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";

export default function SaleKeysPage() {
  return (
    <AdminPageLayout
      title="Sale Keys"
      subtitle="Quick-key layout status for the Orithos pilot"
    >
      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Sale keys are not part of the Orithos pilot register</h2>
        <p className="mt-1 leading-6">
          This page previously managed Classic MySQL sale-key sets. The pilot Sell screen uses the Orithos
          product catalogue, search, and pack factors instead. Changes here would not affect Orithos POS.
        </p>
      </section>

      <dl className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4">
        <div className="grid gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="text-sm font-medium text-[var(--oh-text)]">Pilot sell screen</dt>
          <dd className="text-sm text-[var(--oh-muted)]">
            Use{" "}
            <Link href="/" className="font-semibold text-[var(--oh-primary)] underline">
              Sell
            </Link>{" "}
            with Orithos products
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="text-sm font-medium text-[var(--oh-text)]">Classic sale keys API</dt>
          <dd className="text-sm text-[var(--oh-muted)]">Reference only — not writable business source of truth</dd>
        </div>
      </dl>
    </AdminPageLayout>
  );
}
