export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { BarcodeIcon, SelectChevronIcon, PrinterIcon } from "@/components/icons";

export default function BarcodesPage() {
  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="flex items-center gap-3 text-[34px] font-bold text-black"><BarcodeIcon size={30} /> Barcodes</h1>

      <div className="mt-6 max-w-2xl rounded-lg border border-neutral-300 p-6">
        <h2 className="text-[22px] font-bold text-black">Generate Barcodes</h2>
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col text-[16px] text-black">Products
            <span className="mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-4 text-neutral-400">Select Products... <SelectChevronIcon size={18} /></span>
          </label>
          <label className="flex flex-col text-[16px] text-black">Template
            <span className="mt-1 flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-4 text-neutral-400">EAN-13 (40mm x 28mm) <SelectChevronIcon size={18} /></span>
          </label>
          <label className="flex flex-col text-[16px] text-black">Quantity per product
            <input defaultValue={1} className="mt-1 h-[52px] rounded-lg border border-neutral-300 px-4 text-[16px] outline-none" />
          </label>
          <button className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#5cb3e0] py-3 text-[16px] font-bold text-white"><PrinterIcon size={18} /> Generate &amp; Print</button>
        </div>
      </div>
    </div>
  );
}
