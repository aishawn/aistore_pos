import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const devices = [
  ["Receipt printer", "Not connected or verified"],
  ["Cash drawer", "Not connected or verified"],
  ["Barcode scanner", "Scanner input has not been tested on this terminal"],
  ["Customer display", "Not connected or verified"],
];

export default function HardwarePage() {
  return (
    <AdminPageLayout
      title="Hardware"
      subtitle="Peripheral connection status for the current POS terminal"
    >
      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">No hardware connection has been verified</h2>
        <p className="mt-1 leading-6">
          The printer and drawer shown previously were sample values, not detected devices. Hardware setup is local to the POS terminal and is not managed by Odoo here.
        </p>
      </section>

      <dl className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)] bg-white px-4">
        {devices.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-[var(--oh-text)]">{label}</dt>
            <dd className="text-sm text-[var(--oh-muted)]">{value}</dd>
          </div>
        ))}
      </dl>
    </AdminPageLayout>
  );
}
