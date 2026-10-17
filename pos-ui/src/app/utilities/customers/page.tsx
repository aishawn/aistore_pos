export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { SelectChevronIcon, ViewIcon } from "@/components/icons";

const CUSTOMERS = ["Aliyah Roberts", "Benjamin Kovacek", "Billie Nader", "Brandt Willms", "Calista Cremin"];

function Field({ label, value, isDate }: { label: string; value: string; isDate?: boolean }) {
  return (
    <label className="flex flex-col text-[16px] text-black">
      {label}
      <span className="mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-3 text-[16px] text-neutral-400">
        {value} {!isDate && <SelectChevronIcon size={18} />}
      </span>
    </label>
  );
}

export default function CustomerUtilitiesPage() {
  return (
    <div className="flex h-full flex-col bg-white font-sans">
      <div className="flex-1 overflow-auto p-6 pb-24">
        <h1 className="text-[34px] font-bold text-black">Customer Utilities</h1>

        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-4">
          <label className="flex flex-col text-[16px] text-black">Name
            <input placeholder="Search by Name..." className="mt-1 h-[52px] rounded-lg border border-neutral-300 px-3 outline-none placeholder:text-neutral-400" />
          </label>
          <Field label="Customer Group" value="Select Groups..." />
          <Field label="Price List" value="Select Price Lists..." />
          <Field label="Balance" value="Any Balance" />
          <Field label="Created At" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
          <Field label="Last Purchase Date" value="DD/MM/YYYY — DD/MM/YYYY" isDate />
        </div>
        <div className="mt-4 flex justify-end">
          <button className="rounded-lg bg-[#5cb3e0] px-8 py-3 text-[16px] font-bold text-white">Apply Filter</button>
        </div>

        <div className="mt-5 text-[16px]">
          <div className="flex items-center rounded-md bg-[#5cb3e0] px-4 py-3 font-bold text-white">
            <span className="mr-3 h-4 w-4 bg-white" />
            <span className="flex-1">Name</span>
            <span className="w-[140px] text-right">Actions</span>
          </div>
          {CUSTOMERS.map((c, i) => (
            <div key={c} className={`flex items-center px-4 py-4 ${i % 2 === 1 ? "bg-[#f3f3f3]" : "bg-white"}`}>
              <span className="mr-3 h-4 w-4 rounded-sm border border-neutral-400" />
              <span className="flex-1 text-black">{c}</span>
              <span className="flex w-[140px] items-center justify-end gap-1.5 font-semibold text-[var(--sf-tab-blue)]"><ViewIcon size={18} /> View</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center bg-[#3a3d42] px-6 py-4 text-white">
        <span className="text-[16px]">0 selected</span>
        <div className="ml-auto flex gap-4">
          <button className="rounded bg-neutral-200 px-6 py-2.5 text-[16px] text-neutral-700">Change Name Casing</button>
          <button className="rounded bg-neutral-200 px-6 py-2.5 text-[16px] text-neutral-700">Merge Customers</button>
          <button className="rounded bg-neutral-200 px-6 py-2.5 text-[16px] text-neutral-700">Delete Customers</button>
        </div>
      </div>
    </div>
  );
}
