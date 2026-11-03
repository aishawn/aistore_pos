"use client";
import Link from "next/link";
import { CostReconciliationPanel } from "@/components/CostReconciliationPanel";
import { useAuth } from "@/lib/auth";

export default function CostReconciliationPage() {
  const { user, ready } = useAuth();
  if (!ready) return <p role="status" className="p-6">Checking store access…</p>;
  if (!user?.isAdmin && user?.roleCode !== "ADMIN") return <p role="alert" className="p-6">Store administrator access is required.</p>;
  return <main className="h-full overflow-y-auto p-4 md:p-6"><div className="mx-auto max-w-6xl"><Link href="/products?dialog=cost-reconciliation" className="inline-flex min-h-11 items-center underline">Back to Products</Link><h1 className="mb-4 text-2xl font-semibold">Cost Reconciliation</h1><CostReconciliationPanel /></div></main>;
}
