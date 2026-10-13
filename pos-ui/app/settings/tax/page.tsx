"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { getOdooSession, searchOdooRecords, type OdooTaxRecord } from "@/lib/odoo-api";

function formatRate(tax: OdooTaxRecord) {
  if (tax.amount_type === "percent" || tax.amount_type === "division") return `${tax.amount}%`;
  if (tax.amount_type === "fixed") return `$${tax.amount.toFixed(2)} / unit`;
  if (tax.amount_type === "group") return "Group of taxes";
  return `${tax.amount} (${tax.amount_type})`;
}

export default function TaxRatesPage() {
  const [taxes, setTaxes] = useState<OdooTaxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getOdooSession();
        if (!session) throw new Error("Connect your Odoo staff account to view live tax rates.");
        const result = await searchOdooRecords<OdooTaxRecord>("taxes", { limit: 100 });
        if (active) setTaxes(result.items);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Odoo tax rates.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <AdminPageLayout
      title="Tax Rates"
      subtitle="Active sales taxes visible to your Odoo account"
      count={taxes.length}
      countLabel="Rates"
    >
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <p className="font-semibold text-[var(--oh-text)]">Live from Odoo · Read only</p>
        <p className="mt-1">Tax rates used in sales are controlled by Odoo. Orithos does not save a second copy.</p>
      </section>
      {error ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {error} <Link className="font-semibold underline" href="/settings/integrations">Open Integrations</Link>
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading Odoo tax rates…</div>
      ) : taxes.length === 0 ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          No active sales tax rates are visible to this Odoo account.
        </div>
      ) : (
        <ListTable
          columns={[{ label: "Tax" }, { label: "Rate" }, { label: "Calculation" }, { label: "Company" }]}
          rows={taxes.map((tax) => [
            tax.name,
            formatRate(tax),
            `${tax.price_include ? "Price included" : "Added to price"} · Sales`,
            Array.isArray(tax.company_id) ? tax.company_id[1] : "Shared",
          ])}
        />
      )}
    </AdminPageLayout>
  );
}
