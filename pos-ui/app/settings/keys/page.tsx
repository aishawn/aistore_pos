import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export default function SaleKeysPage() {
  return (
    <AdminPageLayout
      title="Sale Keys"
      subtitle="Quick-key layout status for the Orithos pilot"
    >
      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Sale keys are not part of the Odoo pilot register</h2>
        <p className="mt-1 leading-6">
          This page previously managed Classic MySQL sale-key sets. The pilot Sell screen uses the Odoo
          product catalogue, search, and pack factors instead. Changes here would not affect Odoo POS.
        </p>
      </section>

      <dl className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)] bg-white px-4">
        <div className="grid gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="text-sm font-medium text-[var(--oh-text)]">Pilot sell screen</dt>
          <dd className="text-sm text-[var(--oh-muted)]">
            Use{" "}
            <a href="/" className="font-semibold text-[var(--oh-primary)] underline">
              Sell
            </a>{" "}
            with Odoo products
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
