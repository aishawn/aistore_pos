import { OdooPurchaseOrdersPage } from "@/components/OdooPurchaseOrdersPage";

export default function PurchaseReportsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6 md:py-3.5">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Odoo workflow</p>
        <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Purchase orders</h1>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">Review RFQs and purchase orders from the connected Orithos account.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <OdooPurchaseOrdersPage embedded />
      </div>
    </div>
  );
}
