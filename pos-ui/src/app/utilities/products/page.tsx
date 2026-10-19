import Link from "next/link";
import { AlertCircle, ArrowUpRight } from "lucide-react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProductUtilitiesPage() {
  return <AdminPageLayout title="Product Utilities" subtitle="Bulk edit and manage product records"><section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" /><div><h2 className="font-semibold">Product utilities are not connected to Odoo for this pilot</h2><p className="mt-2 max-w-3xl text-sm leading-6">The previous filters, sample product rows, and bulk actions were visual placeholders. This page does not load, edit, change status, or delete product data.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/products/odoo" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open Odoo product catalogue <ArrowUpRight size={15} aria-hidden="true" /></Link><Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-950 hover:bg-amber-100">Integration status</Link></div></div></div></section></AdminPageLayout>;
}
