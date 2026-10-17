export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

const companyStatus = [
  ["Business facts source", "Odoo company, taxes, payment methods, and POS config"],
  ["General company options", "Not connected in Orithos — previous values were examples"],
  ["Price rounding / cost methods", "Configure in Odoo if required for this store"],
  ["Cash in / cash out reasons", "Not available here — Manage Cash is not wired to Odoo"],
  ["Parked sale and refund policy", "Follow Odoo POS and Orithos register behaviour"],
];

export default function GeneralCompanySettingsPage() {
  return (
    <AdminPageLayout
      title="Company Settings"
      subtitle="Store configuration status for the Orithos pilot"
    >
      <section role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="font-semibold">These options are not connected to Odoo</h2>
        <p className="mt-1 leading-6">
          Earlier company settings on this page were sample values and were not saved to Odoo.
          Use Integrations, Payment Methods, Tax Rates, and Registers &amp; Outlets for live store data.
        </p>
      </section>

      <dl className="mt-4 divide-y divide-[var(--oh-border)] rounded-lg border border-[var(--oh-border)] bg-white px-4">
        {companyStatus.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[240px_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-[var(--oh-text)]">{label}</dt>
            <dd className="text-sm text-[var(--oh-muted)]">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm text-[var(--oh-muted)]">
        Live setup pages:{" "}
        <a href="/settings/integrations" className="font-semibold text-[var(--oh-primary)] underline">Integrations</a>
        {", "}
        <a href="/settings/payment" className="font-semibold text-[var(--oh-primary)] underline">Payment Methods</a>
        {", "}
        <a href="/settings/tax" className="font-semibold text-[var(--oh-primary)] underline">Tax Rates</a>
        {", "}
        <a href="/settings/registers-outlets" className="font-semibold text-[var(--oh-primary)] underline">Registers &amp; Outlets</a>
        .
      </p>
    </AdminPageLayout>
  );
}
