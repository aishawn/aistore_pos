"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { OdooPurchaseOrdersPage } from "@/components/OdooPurchaseOrdersPage";
import { OrithosPurchaseOrdersPage } from "@/components/OrithosPurchaseOrdersPage";
import { OdooReplenishmentPage } from "@/components/OdooReplenishmentPage";
import { InvoiceScansListPage } from "@/components/admin/InvoiceScansListPage";
import { OdooSupplierDirectoryPage } from "@/components/OdooSupplierDirectoryPage";
import { ShopfrontPurchasingSection } from "@/components/ShopfrontPurchasingDirectory";

const views = [
  { key: "orders", label: "Purchase Orders", permission: "stock.purchases" },
  { key: "invoices", label: "Invoices", permission: "stock.invoices" },
  { key: "suppliers", label: "Suppliers", permission: "stock.suppliers" },
  { key: "replenishment", label: "Replenishment", permission: "stock.replenishment" },
] as const;

export function PurchasingWorkspace() {
  const { ready, hasPermission } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("tab") || "orders";
  const transfers = requested === "transfers" || requested === "transfer-new";
  const available = views.filter((view) => hasPermission(view.permission));
  const permitted = transfers ? hasPermission("stock.purchases") : available.some((view) => view.key === requested);
  const active = permitted ? requested : available[0]?.key;
  useEffect(() => {
    if (ready && !permitted && active) router.replace(`/purchases?tab=${active}`);
  }, [ready, permitted, active, router]);
  if (!ready) return <p role="status" className="p-6">Loading purchasing…</p>;
  if (!active) return <p role="alert" className="p-6">You do not have access to purchasing.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 space-y-3 border-b border-[var(--oh-border)] bg-white p-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="oh-type-title text-[var(--oh-text)]">{requested === "orders" ? "Purchase Orders" : "Purchasing"}</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Plan replenishment, manage orders and receive stock.</p></div>
          {hasPermission("stock.purchases") && <details className="relative"><summary className="cursor-pointer rounded-lg border border-[var(--oh-border)] px-4 py-2 text-sm">More</summary><div className="absolute left-0 z-20 mt-2 min-w-48 sm:left-auto sm:right-0 rounded-lg border bg-white p-2 shadow-lg"><Link className="block rounded px-3 py-2 text-sm" href="/purchases?tab=transfers">Stock Transfers</Link></div></details>}
        </div>
        <nav aria-label="Purchasing views" className="flex flex-wrap gap-2">
          {available.map((view) => <Link key={view.key} href={view.key === "orders" ? "/purchases" : `/purchases?tab=${view.key}`} aria-current={active === view.key ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] ${active === view.key ? "bg-[var(--oh-primary)] text-white" : "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]"}`}>{view.label}</Link>)}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {permitted && active === "orders" && <OrithosPurchaseOrdersPage embedded />}
        {permitted && transfers && <OdooPurchaseOrdersPage key={params.get("state") ?? "all"} embedded />}
        {permitted && active === "replenishment" && <OdooReplenishmentPage embedded />}
        {permitted && active === "invoices" && <InvoiceScansListPage embedded />}
        {permitted && active === "suppliers" && <><OdooSupplierDirectoryPage /><ShopfrontPurchasingSection kind="suppliers" /></>}
      </div>
    </div>
  );
}
