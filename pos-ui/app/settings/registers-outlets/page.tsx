"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { getOdooSession, searchOdooRecords } from "@/lib/odoo-api";

type OdooOutlet = {
  id: number;
  name: string;
  currency_id: [number, string] | false;
};

type OdooRegister = {
  id: number;
  name: string;
  company_id: [number, string] | false;
  current_session_id: [number, string] | false;
  payment_method_ids: number[];
  available_pricelist_ids: number[];
};

export default function RegistersOutletsPage() {
  const [outlets, setOutlets] = useState<OdooOutlet[]>([]);
  const [registers, setRegisters] = useState<OdooRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await getOdooSession();
        if (!session) throw new Error("Connect your Odoo staff account to view live stores and registers.");
        const [outletResult, registerResult] = await Promise.all([
          searchOdooRecords<OdooOutlet>("outlets", { limit: 100 }),
          searchOdooRecords<OdooRegister>("registers", { limit: 100 }),
        ]);
        if (active) {
          setOutlets(outletResult.items);
          setRegisters(registerResult.items);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load Odoo stores and registers.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <AdminPageLayout
      title="Registers & Outlets"
      subtitle="Stores and POS registers assigned to your Odoo account"
      count={outlets.length + registers.length}
      countLabel="Stores + registers"
      fullBleed
    >
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        <p className="font-semibold text-[var(--oh-text)]">Live from Odoo · Read only</p>
        <p className="mt-1">Create and configure companies and POS registers in Odoo. These lists never write to Classic MySQL.</p>
      </section>

      {error ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {error} <Link className="font-semibold underline" href="/settings/integrations">Open Integrations</Link>
        </div>
      ) : loading ? (
        <div className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading Odoo stores and registers…</div>
      ) : (
        <div className="grid gap-5">
          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--oh-text)]">Stores / companies</h2>
            {outlets.length ? (
              <ListTable
                columns={[{ label: "Store" }, { label: "Currency" }]}
                rows={outlets.map((outlet) => [outlet.name, Array.isArray(outlet.currency_id) ? outlet.currency_id[1] : "—"])}
              />
            ) : (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No Odoo companies are available to this account.</p>
            )}
          </section>

          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--oh-text)]">POS registers</h2>
            {registers.length ? (
              <ListTable
                columns={[{ label: "Register" }, { label: "Store" }, { label: "Current session" }, { label: "Payment methods" }]}
                rows={registers.map((register) => [
                  register.name,
                  Array.isArray(register.company_id) ? register.company_id[1] : "—",
                  Array.isArray(register.current_session_id) ? register.current_session_id[1] : "No current session",
                  register.payment_method_ids.length,
                ])}
              />
            ) : (
              <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No Odoo POS registers are available to this account.</p>
            )}
          </section>
        </div>
      )}
    </AdminPageLayout>
  );
}
