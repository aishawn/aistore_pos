"use client";

import { useState } from "react";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { useApi } from "@/hooks/useApi";
import { importSupplierProducts, type SupplierProductImportResult } from "@/lib/api";

interface Supplier {
  id: string;
  name: string;
}

interface SupplierPage {
  items: Supplier[];
}

/** Import products from supplier codes (Master Database). */
export function SupplierImportPage() {
  const [supplierId, setSupplierId] = useState("");
  const [productList, setProductList] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupplierProductImportResult | null>(null);

  const suppliers = useApi<SupplierPage>("/api/suppliers", { size: 500, page: 1 });
  const supplierOptions: SelectOption[] = (suppliers.data?.items ?? []).map((s) => ({
    label: s.name,
    value: s.id,
  }));

  async function onImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await importSupplierProducts({
        supplierId,
        productList,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans md:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-[28px] font-bold text-black">Supplier Import</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-neutral-700">
          This will import all products provided from the Master Database, if the products already exist in
          your file they will be ignored. Please provide one supplier code per line.
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <span className="mb-1 block text-[14px] font-bold text-black">Supplier</span>
            <FilterSelect
              label=""
              value={supplierId}
              onChange={setSupplierId}
              options={supplierOptions}
              placeholder="Select..."
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-[14px] font-bold text-black">Product List</span>
            <textarea
              value={productList}
              onChange={(e) => setProductList(e.target.value)}
              rows={12}
              className="w-full resize-y rounded border border-neutral-300 px-3 py-2.5 text-[14px] text-black outline-none focus:border-[#6eb5e0]"
            />
          </label>

          {error && (
            <div className="rounded border border-[#e2231a]/30 bg-[#fff5f5] px-4 py-3 text-[14px] text-[#e2231a]">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-800">
              Imported {result.imported} product{result.imported === 1 ? "" : "s"}, skipped {result.skipped}.
              {result.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[#e2231a]">
                  {result.errors.map((err) => (
                    <li key={`${err.line}-${err.message}`}>
                      Line {err.line}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void onImport()}
            disabled={busy || !supplierId || !productList.trim()}
            className="flex w-full cursor-pointer items-center justify-center rounded bg-[#5cb3e0] px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-[#4aa8d8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
