import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const receiptStatus = [
  ["Automatic printing", "Not connected or verified"],
  ["Email receipts", "Not configured · SMTP is unavailable"],
  ["Paper size and receipt layout", "Not configured in Orithos"],
  ["Tax breakdown", "Checkout calculates GST from Odoo; printed receipt layout is not verified"],
];

export default function ReceiptsPage() {
  return (
    <AdminPageLayout
      title="Receipt Settings"
      subtitle="Receipt preferences and delivery status for this POS"
    >
      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">Receipt settings are not connected yet</h2>
        <p className="mt-1 leading-6">
          The previous values on this page were examples. Orithos does not save or apply them to Odoo, a printer, or email delivery.
        </p>
      </section>

      <dl className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)] bg-white px-4">
        {receiptStatus.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-[var(--oh-text)]">{label}</dt>
            <dd className="text-sm text-[var(--oh-muted)]">{value}</dd>
          </div>
        ))}
      </dl>
    </AdminPageLayout>
  );
}
