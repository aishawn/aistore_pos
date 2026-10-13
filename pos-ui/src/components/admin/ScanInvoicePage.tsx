"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useApi, useApiList } from "@/hooks/useApi";
import { SelectChevronIcon } from "@/components/icons";
import {
  apiFailureMessage,
  saveScannedInvoice,
  scanInvoiceImage,
  type InvoiceScanLine,
  type InvoiceScanPayload,
} from "@/lib/api";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded border border-[#bdbdbd] px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";
const labelClass = "mb-1 block text-[14px] font-bold text-black";

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function toIsoDate(raw?: string | null): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const au = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (au) return `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  return raw;
}

export function ScanInvoicePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scan, setScan] = useState<InvoiceScanPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suppliers = useApiList<Named>("/api/suppliers", { page: 1, size: 500 });
  const outlets = useApi<Named[]>("/api/outlets");

  const supplierOptions = useMemo(
    () => (suppliers.items ?? []).map((s) => ({ label: s.name, value: String(s.id) })),
    [suppliers.items],
  );
  const outletOptions = useMemo(
    () => (outlets.data ?? []).map((o) => ({ label: o.name, value: String(o.id) })),
    [outlets.data],
  );

  useEffect(() => {
    if (!scan || scan.toId || outletOptions.length === 0) return;
    setScan((current) => (current ? { ...current, toId: Number(outletOptions[0].value) } : current));
  }, [outletOptions, scan]);

  async function onPhoto(file: File) {
    setError(null);
    setScan(null);
    setPreview(URL.createObjectURL(file));
    setLoading(true);
    try {
      const prepared = await compressInvoicePhoto(file);
      const data = await scanInvoiceImage(prepared, prepared.name || "invoice.jpg");
      setScan({
        ...data,
        invoiceDate: toIsoDate(data.invoiceDate),
        dueDate: toIsoDate(data.dueDate),
      });
    } catch (e) {
      setError(apiFailureMessage(e, "Could not read that invoice photo.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }

  function patch(update: Partial<InvoiceScanPayload>) {
    setScan((current) => (current ? { ...current, ...update } : current));
  }

  function patchLine(index: number, update: Partial<InvoiceScanLine>) {
    setScan((current) => {
      if (!current) return current;
      const lines = [...(current.lines ?? [])];
      lines[index] = { ...lines[index], ...update };
      return { ...current, lines };
    });
  }

  async function save() {
    if (!scan || saving) return;
    if (!scan.supplierId && !scan.supplierName?.trim()) {
      setError("Supplier is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveScannedInvoice({
        ...scan,
        invoiceDate: scan.invoiceDate || null,
        dueDate: scan.dueDate || null,
        createSupplier: !scan.supplierId,
      });
      router.push(`/orders/${saved.id}/view`);
    } catch (e) {
      setError(apiFailureMessage(e, "Failed to save invoice.", "Please sign in again."));
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 bg-[#5cb3e0] px-6 py-3">
        <h1 className="text-[20px] font-semibold text-white">Scan Invoice</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPhoto(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded bg-[#5cb3e0] px-4 py-2.5 text-[15px] font-medium text-white hover:bg-[#4aa8d8]"
            >
              <Camera size={18} />
              Photograph invoice
            </button>
            <p className="mt-2 text-[13px] text-neutral-500">
              Take a photo or upload a supplier tax invoice. Fields are filled by OCR, then saved as a received order.
            </p>
          </div>

          {preview ? (
            <img src={preview} alt="Invoice preview" className="max-h-64 w-fit rounded border border-neutral-200 object-contain" />
          ) : null}

          {loading ? <p className="text-[14px] text-neutral-600">Reading the invoice…</p> : null}
          {error ? <p className="text-[14px] text-red-600">{error}</p> : null}

          {scan ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col">
                  <span className={labelClass}>Supplier</span>
                  <div className="relative">
                    <select
                      value={scan.supplierId ? String(scan.supplierId) : ""}
                      onChange={(e) =>
                        patch({
                          supplierId: e.target.value ? Number(e.target.value) : null,
                          createSupplier: !e.target.value,
                        })
                      }
                      className={`${fieldClass} appearance-none pr-10`}
                    >
                      <option value="">
                        {scan.supplierName ? `Create “${scan.supplierName}”` : "Select supplier…"}
                      </option>
                      {supplierOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <SelectChevronIcon
                      size={16}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
                    />
                  </div>
                </label>
                <label className="flex flex-col">
                  <span className={labelClass}>Outlet</span>
                  <div className="relative">
                    <select
                      value={scan.toId ? String(scan.toId) : ""}
                      onChange={(e) => patch({ toId: e.target.value ? Number(e.target.value) : null })}
                      className={`${fieldClass} appearance-none pr-10`}
                    >
                      {outletOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <SelectChevronIcon
                      size={16}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
                    />
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex flex-col">
                  <span className={labelClass}>Invoice Number</span>
                  <input
                    value={scan.invoiceNumber ?? ""}
                    onChange={(e) => patch({ invoiceNumber: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col">
                  <span className={labelClass}>Invoice Date</span>
                  <input
                    type="date"
                    value={toIsoDate(scan.invoiceDate)}
                    onChange={(e) => patch({ invoiceDate: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="flex flex-col">
                  <span className={labelClass}>Total Payable</span>
                  <input readOnly value={money(scan.totalPayable)} className={`${fieldClass} bg-neutral-100`} />
                </label>
              </div>

              <div className="overflow-x-auto rounded border border-neutral-200">
                <table className="min-w-full text-left text-[14px]">
                  <thead className="bg-neutral-50 text-[13px] uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Pack</th>
                      <th className="px-3 py-2 text-right">Cases</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(scan.lines ?? []).map((line, index) => (
                      <tr key={`${line.description}-${index}`} className="border-t border-neutral-200">
                        <td className="px-3 py-2">
                          <input
                            value={line.description ?? ""}
                            onChange={(e) => patchLine(index, { description: e.target.value })}
                            className="h-9 w-full rounded border border-[#bdbdbd] px-2"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{line.packQty ?? "—"}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={line.qtyCases ?? ""}
                            onChange={(e) =>
                              patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })
                            }
                            className="h-9 w-20 rounded border border-[#bdbdbd] px-2 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{money(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right">{money(line.lineTotal)}</td>
                        <td className="px-3 py-2 text-[13px] text-neutral-500">
                          {line.productId ? `#${line.productId}` : "New product"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 justify-end border-t border-neutral-200 px-6 py-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!scan || saving || loading}
          className="rounded bg-[#5cb3e0] px-10 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#4aa8d8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save invoice"}
        </button>
      </div>
    </div>
  );
}

async function compressInvoicePhoto(file: File): Promise<File> {
  if (file.size < 800_000 && (file.type === "image/jpeg" || file.type === "image/jpg")) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], "invoice.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
