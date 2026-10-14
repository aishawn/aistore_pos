"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileImage, LoaderCircle, ReceiptText } from "lucide-react";
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
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--oh-text)]";

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

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

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
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Purchasing · Documents</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Scan supplier invoice</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Review the details extracted from your invoice before saving it as a received order.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <section className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white p-4 sm:p-5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Choose or photograph a supplier invoice"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPhoto(file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><FileImage size={21} aria-hidden="true" /></span>
                <div className="min-w-0"><h2 className="text-sm font-semibold text-[var(--oh-text)]">Upload a supplier invoice</h2><p className="mt-1 text-sm leading-5 text-[var(--oh-muted)]">Take a photo or choose an image. OCR will fill in the invoice details for review.</p></div>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={loading || saving}
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Camera size={17} />}
                {loading ? "Reading invoice…" : preview ? "Choose another image" : "Photograph or upload"}
              </button>
            </div>
            {preview && <figure className="mt-4 flex flex-col items-start gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:items-center"><img src={preview} alt="Invoice preview" className="max-h-64 max-w-full rounded-lg border border-[var(--oh-border)] object-contain" /><figcaption className="text-xs text-[var(--oh-muted)]">Uploaded invoice image</figcaption></figure>}
          </section>

          {loading && <div role="status" className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><LoaderCircle size={17} className="animate-spin" />Reading the invoice and extracting line items…</div>}
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800">{error}</p>}

          {scan && (
            <>
              <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="mb-4 border-b border-[var(--oh-border)] pb-3"><h2 className="text-sm font-semibold text-[var(--oh-text)]">Invoice details</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Check supplier, destination and document totals before saving.</p></div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col">
                    <span className={labelClass}>Supplier</span>
                    <div className="relative">
                      <select
                        value={scan.supplierId ? String(scan.supplierId) : ""}
                        onChange={(e) => patch({ supplierId: e.target.value ? Number(e.target.value) : null, createSupplier: !e.target.value })}
                        className={`${fieldClass} appearance-none pr-10`}
                      >
                        <option value="">{scan.supplierName ? `Create “${scan.supplierName}”` : "Select supplier…"}</option>
                        {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <SelectChevronIcon size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
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
                        {outletOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <SelectChevronIcon size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                    </div>
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col"><span className={labelClass}>Invoice number</span><input value={scan.invoiceNumber ?? ""} onChange={(e) => patch({ invoiceNumber: e.target.value })} className={fieldClass} /></label>
                  <label className="flex flex-col"><span className={labelClass}>Invoice date</span><input type="date" value={toIsoDate(scan.invoiceDate)} onChange={(e) => patch({ invoiceDate: e.target.value })} className={fieldClass} /></label>
                  <label className="flex flex-col"><span className={labelClass}>Total payable</span><input readOnly value={money(scan.totalPayable)} className={`${fieldClass} bg-[var(--oh-surface)] font-semibold tabular-nums`} /></label>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
                <header className="border-b border-[var(--oh-border)] px-4 py-3 sm:px-5"><div className="flex items-center gap-2"><ReceiptText size={17} className="text-[var(--oh-primary)]" /><h2 className="text-sm font-semibold text-[var(--oh-text)]">Invoice line items</h2></div><p className="mt-1 text-xs text-[var(--oh-muted)]">Review product descriptions and case quantities extracted by OCR.</p></header>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Pack</th><th className="px-4 py-3 text-right">Cases</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Match</th></tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">{(scan.lines ?? []).map((line, index) => (
                      <tr key={`${line.description}-${index}`} className="hover:bg-[var(--oh-surface)]/60">
                        <td className="px-4 py-2.5"><input aria-label={`Product description ${index + 1}`} value={line.description ?? ""} onChange={(e) => patchLine(index, { description: e.target.value })} className="h-10 w-full min-w-48 rounded-lg border border-[var(--oh-border)] px-2.5 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{line.packQty ?? "—"}</td>
                        <td className="px-4 py-2.5"><input aria-label={`Cases for line ${index + 1}`} type="number" min="0" step="0.01" value={line.qtyCases ?? ""} onChange={(e) => patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })} className="h-10 w-24 rounded-lg border border-[var(--oh-border)] px-2.5 text-right tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" /></td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(line.unitPrice)}</td><td className="px-4 py-2.5 text-right font-medium tabular-nums text-[var(--oh-text)]">{money(line.lineTotal)}</td>
                        <td className="px-4 py-2.5 text-xs text-[var(--oh-muted)]">{line.productId ? `#${line.productId}` : "New product"}</td>
                      </tr>
                    ))}{!scan.lines?.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--oh-muted)]">No line items were detected on this invoice.</td></tr>}</tbody>
                  </table>
                </div>
                <div className="divide-y divide-[var(--oh-border)] md:hidden">{(scan.lines ?? []).map((line, index) => (
                  <article key={`${line.description}-${index}`} className="space-y-3 p-4">
                    <label className="block"><span className={labelClass}>Product</span><input aria-label={`Product description ${index + 1}`} value={line.description ?? ""} onChange={(e) => patchLine(index, { description: e.target.value })} className={fieldClass} /></label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2"><p className="text-xs text-[var(--oh-muted)]">Pack</p><p className="mt-1 text-sm tabular-nums text-[var(--oh-text-secondary)]">{line.packQty ?? "—"}</p></div>
                      <label><span className={labelClass}>Cases</span><input aria-label={`Cases for line ${index + 1}`} type="number" min="0" step="0.01" value={line.qtyCases ?? ""} onChange={(e) => patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })} className={fieldClass} /></label>
                      <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2"><p className="text-xs text-[var(--oh-muted)]">Price</p><p className="mt-1 text-sm tabular-nums text-[var(--oh-text-secondary)]">{money(line.unitPrice)}</p></div>
                      <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2"><p className="text-xs text-[var(--oh-muted)]">Total</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{money(line.lineTotal)}</p></div>
                    </div>
                    <p className="text-xs text-[var(--oh-muted)]">{line.productId ? `Matched product #${line.productId}` : "New product — review before saving"}</p>
                  </article>
                ))}{!scan.lines?.length && <p className="px-4 py-10 text-center text-sm text-[var(--oh-muted)]">No line items were detected on this invoice.</p>}</div>
              </section>
            </>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--oh-muted)]">{scan ? "Review supplier, quantities and totals before saving." : "Choose an invoice image to begin."}</p>
          <button type="button" onClick={() => void save()} disabled={!scan || saving || loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            {saving && <LoaderCircle size={16} className="animate-spin" />}{saving ? "Saving…" : "Save as received order"}
          </button>
        </div>
      </footer>
    </main>
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
