import { DataTable } from "@/components/admin/DataTable";
import { EditIcon, PrinterIcon } from "@/components/icons";

/**
 * Dashboard — a board of widgets. Mirrors the live default layout: a single
 * "Refunded Sales" table widget, with floating Edit (green) and Print (dark)
 * action buttons in the top-right. Data is representative mock content.
 */
export default function DashboardPage() {
  return (
    <div className="relative h-full overflow-auto bg-white font-sans">
      {/* Floating actions */}
      <div className="absolute right-4 top-4 flex flex-col gap-3">
        <button
          type="button"
          aria-label="Edit dashboard"
          className="flex h-12 w-11 items-center justify-center rounded-xl bg-[#3cb44b] text-white"
        >
          <EditIcon size={20} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Print"
          className="flex h-12 w-11 items-center justify-center rounded-xl bg-[#3a3d42] text-white"
        >
          <PrinterIcon size={20} strokeWidth={1.75} />
        </button>
      </div>

      <div className="p-8">
        <section className="max-w-[970px]">
          <h2 className="mb-2 text-[18px] font-bold text-black">Refunded Sales</h2>
          <DataTable
            columns={[
              { label: "Product" },
              { label: "Refunded Quantity", align: "center" },
              { label: "Refunded Amount", align: "right" },
              { label: "Invoice Number", align: "center" },
              { label: "User", align: "center" },
              { label: "Date and Time", align: "center" },
            ]}
            rows={[
              [
                "Yalumba Prem Sel P/grig Csk 2l",
                "1",
                "$17.00",
                <a key="inv" href="#" className="text-[var(--sf-tab-blue)] underline">
                  10000017
                </a>,
                "admin",
                "24/06/2026 21:07:35",
              ],
            ]}
            totals={[null, "1", "$17.00", null, null, null]}
          />
        </section>
      </div>
    </div>
  );
}
