import { DataTable } from "@/components/admin/DataTable";
import { AdminPageLayout, AdminOutlineButton } from "@/components/admin/AdminPageLayout";
import { EditIcon, PrinterIcon } from "@/components/icons";

export default function DashboardPage() {
  return (
    <AdminPageLayout
      title="Dashboard"
      subtitle="Overview of store performance and activity"
      actions={
        <div className="flex gap-2">
          <AdminOutlineButton aria-label="Edit dashboard">
            <EditIcon size={16} /> Edit
          </AdminOutlineButton>
          <button
            type="button"
            aria-label="Print"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--oh-radius)] bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"
          >
            <PrinterIcon size={16} />
          </button>
        </div>
      }
    >
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-[var(--oh-text)]">Refunded Sales</h2>
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
              <a key="inv" href="#" className="text-[var(--oh-orange)] underline">
                10000017
              </a>,
              "admin",
              "24/06/2026 21:07:35",
            ],
          ]}
          totals={[null, "1", "$17.00", null, null, null]}
        />
      </section>
    </AdminPageLayout>
  );
}
