import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { PlusIcon } from "@/components/icons";

const ENTRIES = [
  ["Main Warehouse", "Outlet"],
  ["City Store", "Outlet"],
  ["Airport Kiosk", "Outlet"],
];

export default function TransferListPage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Transfer List</h1>
        <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={18} /> New</button>
      </div>

      <div className="mt-6">
        <ListTable
          columns={[{ label: "Name" }, { label: "Type" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
          rows={ENTRIES.map(([n, t]) => [n, t, <RowActions key="a" />])}
        />
      </div>
    </div>
  );
}
