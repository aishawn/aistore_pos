"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { getOdooPosBootstrap, getOdooSession, type OdooPosBootstrap } from "@/lib/odoo-api";

type PaymentRow = {
  id: number;
  name: string;
  type: string;
  registers: string[];
};

function paymentType(type: string, isCash: boolean) {
  if (isCash || type === "cash") return "Cash";
  if (type === "bank") return "Card / bank";
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toRows(data: OdooPosBootstrap): PaymentRow[] {
  const methods = new Map<number, PaymentRow>();
  for (const config of data.configs) {
    for (const method of config.paymentMethods) {
      const existing = methods.get(method.id);
      if (existing) {
        if (!existing.registers.includes(config.name)) existing.registers.push(config.name);
      } else {
        methods.set(method.id, {
          id: method.id,
          name: method.name,
          type: paymentType(method.type, method.is_cash_count),
          registers: [config.name],
        });
      }
    }
  }
  return [...methods.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function PaymentMethodsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getOdooSession();
        if (!session) throw new Error("Connect your Odoo staff account to view live payment methods.");
        const bootstrap = await getOdooPosBootstrap();
        if (active) setRows(toRows(bootstrap));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Odoo payment methods.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <AdminPageLayout
      title="Payment Methods"
      subtitle="Payment methods assigned to your Odoo POS registers"
      count={rows.length}
      countLabel="Methods"
    >
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <p className="font-semibold text-[var(--oh-text)]">Live from Odoo · Read only</p>
        <p className="mt-1">Changes to payment methods should be made in Odoo. Orithos does not save a second copy.</p>
      </section>
      {error ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {error} <Link className="font-semibold underline" href="/settings/integrations">Open Integrations</Link>
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading Odoo payment methods…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          No payment methods are assigned to the Odoo POS registers available to this account.
        </div>
      ) : (
        <ListTable
          columns={[{ label: "Payment method" }, { label: "Type" }, { label: "Odoo register" }]}
          rows={rows.map((row) => [row.name, row.type, row.registers.join(", ")])}
        />
      )}
    </AdminPageLayout>
  );
}
