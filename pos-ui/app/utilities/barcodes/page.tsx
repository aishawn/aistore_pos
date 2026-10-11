import {
  AdminPageLayout,
  AdminPrimaryButton,
} from "@/components/admin/AdminPageLayout";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { PrinterIcon } from "@/components/icons";

export default function BarcodesPage() {
  return (
    <AdminPageLayout
      title="Barcodes"
      subtitle="Generate and print product barcode labels"
    >
      <div className="max-w-2xl">
        <h2 className="mb-4 text-[15px] font-semibold text-[var(--oh-text)]">Generate Barcodes</h2>
        <div className="flex flex-col gap-4">
          <FilterSelect label="Products" placeholder="Select Products…" />
          <FilterSelect label="Template" placeholder="EAN-13 (40mm x 28mm)" />
          <label className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Quantity per product</span>
            <input
              type="number"
              defaultValue={1}
              className="h-10 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
            />
          </label>
          <AdminPrimaryButton className="mt-2 w-fit">
            <PrinterIcon size={16} /> Generate &amp; Print
          </AdminPrimaryButton>
        </div>
      </div>
    </AdminPageLayout>
  );
}
