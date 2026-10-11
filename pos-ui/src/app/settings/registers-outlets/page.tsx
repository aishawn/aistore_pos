import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { PlusIcon, StoreIcon, RegisterIcon } from "@/components/icons";

export default function RegistersOutletsPage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="text-[34px] font-bold text-black">Registers &amp; Outlets</h1>

      <div className="mt-6 flex items-center gap-4">
        <h2 className="flex items-center gap-2 text-[24px] font-bold text-black"><StoreIcon size={22} /> Outlets</h2>
        <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-4 py-2 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={16} /> New Outlet</button>
      </div>
      <div className="mt-3">
        <ListTable
          columns={[{ label: "Outlet" }, { label: "Address" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
          rows={[
            ["Main Outlet", "11 Example St, Sydney NSW", <RowActions key="a" />],
            ["City Store", "200 George St, Sydney NSW", <RowActions key="a" />],
          ]}
        />
      </div>

      <div className="mt-8 flex items-center gap-4">
        <h2 className="flex items-center gap-2 text-[24px] font-bold text-black"><RegisterIcon size={22} /> Registers</h2>
        <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-4 py-2 font-semibold text-[var(--sf-tab-blue)]"><PlusIcon size={16} /> New Register</button>
      </div>
      <div className="mt-3">
        <ListTable
          columns={[{ label: "Register" }, { label: "Outlet" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
          rows={[
            ["Register #1", "Main Outlet", <RowActions key="a" />],
            ["Register #2", "City Store", <RowActions key="a" />],
          ]}
        />
      </div>
    </div>
  );
}
