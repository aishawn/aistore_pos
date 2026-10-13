import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { SelectChevronIcon, ViewIcon } from "@/components/icons";

const PRODUCTS = ["Absolut Vodka 1l", "Asahi Soukai 3.5% Btl 330ml", "Bacardi Carta Blanca 700ml", "BADEL PELINKOVAC 1LT", "Baileys Irish Crm 1l"];

function Field({ label, value, isDate }: { label: string; value: string; isDate?: boolean }) {
  return (
    <label className="flex flex-col">
      <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      <span className="flex h-10 items-center justify-between rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-placeholder)]">
        {value} {!isDate && <SelectChevronIcon size={16} />}
      </span>
    </label>
  );
}

export default function ProductUtilitiesPage() {
  return (
    <AdminPageLayout
      title="Product Utilities"
      subtitle="Bulk edit and manage product records"
      fullBleed
      filters={
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Name</span>
            <input placeholder="Search by Name…" className="h-10 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)]" />
          </label>
          <Field label="Category" value="Select Categories…" />
          <Field label="Brands" value="Select Brands…" />
          <Field label="Families" value="Select Families…" />
          <Field label="Tags" value="Select Tags…" />
          <Field label="Statuses" value="Select Statuses…" />
          <Field label="Host Deletions" value="Select Host Deletions…" />
          <Field label="Stock Level" value="Any Stock Level" />
          <Field label="Created At" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
          <Field label="Last Sold Date" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
          <Field label="Last Purchased Date" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
          <Field label="Last Stocktaked Date" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
        </div>
      }
    >
      <div className="mb-4 flex justify-end">
        <AdminPrimaryButton>Apply Filter</AdminPrimaryButton>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white text-[14px]">
        <div className="flex items-center bg-[var(--oh-primary)] px-4 py-3 text-[13px] font-semibold uppercase tracking-wide text-white">
          <span className="mr-3 h-4 w-4 rounded border border-white/40" />
          <span className="flex-1">Name</span>
          <span className="w-[120px] text-right">Actions</span>
        </div>
        {PRODUCTS.map((p, i) => (
          <div key={p} className={`flex items-center px-4 py-3.5 ${i % 2 === 1 ? "bg-[var(--oh-surface)]" : "bg-white"}`}>
            <span className="mr-3 h-4 w-4 rounded border border-[var(--oh-border)]" />
            <span className="flex-1 text-[var(--oh-text)]">{p}</span>
            <span className="flex w-[120px] items-center justify-end gap-1.5 text-[13px] font-medium text-[var(--oh-orange)]">
              <ViewIcon size={16} /> View
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center rounded-lg bg-[var(--oh-primary)] px-5 py-3 text-white">
        <span className="text-[14px]">0 selected</span>
        <div className="ml-auto flex gap-3">
          <AdminSecondaryButton className="border-white/30 text-white hover:bg-white/10">Change Name Casing</AdminSecondaryButton>
          <AdminSecondaryButton className="border-white/30 text-white hover:bg-white/10">Change Statuses</AdminSecondaryButton>
          <AdminSecondaryButton className="border-white/30 text-white hover:bg-white/10">Delete Products</AdminSecondaryButton>
        </div>
      </div>
    </AdminPageLayout>
  );
}
