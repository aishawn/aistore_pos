"use client";

import Link from "next/link";

/** Cost reconciliation previously depended on Odoo + Shopfront receipt chains. */
export function CostReconciliationPanel() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <header>
        <h2 className="text-lg font-semibold text-[var(--oh-text)]">Cost reconciliation</h2>
        <p className="mt-1 text-[var(--oh-muted)]">
          The Odoo/Shopfront receipt audit is retired. Orithos ledger margin is available on Reports overview using native sale costs.
        </p>
      </header>
      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="font-semibold">Native FIFO receipt audit is not available yet.</p>
        <p className="mt-2 leading-6">Use Reports for Orithos gross profit while receipt-level cost audit is rebuilt on the Orithos purchase ledger.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/reports/dashboard" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Open reports overview</Link>
        <Link href="/reports/sales" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold">Sales report</Link>
      </div>
    </div>
  );
}
