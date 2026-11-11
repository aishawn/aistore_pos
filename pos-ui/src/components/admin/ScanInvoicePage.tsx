"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, FileImage, FileText, LoaderCircle, ReceiptText } from "lucide-react";
import { SelectChevronIcon } from "@/components/icons";
import { AsyncDependencyNotice } from "@/components/admin/AsyncState";
import {
  ApiError,
  apiFailureMessage,
  createInvoiceScan,
  fetchAiClientConfig,
  scanInvoiceImage,
  suggestedInvoiceSupplierByAbn,
  type InvoiceScanLine,
  type InvoiceScanPayload,
  type InvoiceScanSourceType,
} from "@/lib/api";
import { getOdooSession, searchOdooRecords } from "@/lib/odoo-api";
import { InvoiceWorkflowSteps } from "@/components/admin/InvoiceWorkflowSteps";

interface Named {
  id: number;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";
const labelClass = "mb-1.5 block text-sm font-medium text-[var(--oh-text)]";
const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

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
  const cameraRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [sourceType, setSourceType] = useState<InvoiceScanSourceType>("upload");
  const [scan, setScan] = useState<InvoiceScanPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [assistantAvailable, setAssistantAvailable] = useState<boolean | null>(null);
  const [invoiceVisionAvailable, setInvoiceVisionAvailable] = useState<boolean | null>(null);
  const [invoiceWorkflowRetired, setInvoiceWorkflowRetired] = useState(false);
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const scanRevision = useRef(0);

  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [outlets, setOutlets] = useState<Named[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [outletsLoading, setOutletsLoading] = useState(true);
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
  const [outletsError, setOutletsError] = useState<string | null>(null);

  const loadCapabilities = useCallback(async () => {
    setCapabilityLoading(true);
    setCapabilityError(false);
    try {
      const config = await fetchAiClientConfig();
      setAiEnabled(config.enabled);
      setAssistantAvailable(config.assistantAvailable ?? config.enabled);
      setInvoiceVisionAvailable(config.invoiceVisionAvailable ?? config.enabled);
    } catch {
      setCapabilityError(true);
    } finally {
      setCapabilityLoading(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    setSuppliersError(null);
    try {
      const session = await getOdooSession();
      if (!session) throw new Error("Connect your Orithos staff account to load suppliers.");
      const page = await searchOdooRecords<Named>("suppliers", { limit: 100 });
      setSuppliers(page.items);
    } catch (cause) {
      setSuppliers([]);
      setSuppliersError(cause instanceof Error ? cause.message : "Could not load suppliers.");
    } finally {
      setSuppliersLoading(false);
    }
  }, []);

  const loadOutlets = useCallback(async () => {
    setOutletsLoading(true);
    setOutletsError(null);
    try {
      const session = await getOdooSession();
      if (!session) throw new Error("Connect your Orithos staff account to load outlets.");
      const page = await searchOdooRecords<Named>("outlets", { limit: 100 });
      setOutlets(page.items);
    } catch (cause) {
      setOutlets([]);
      setOutletsError(cause instanceof Error ? cause.message : "Could not load outlets.");
    } finally {
      setOutletsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    void loadSuppliers();
    void loadOutlets();
  }, [loadSuppliers, loadOutlets]);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ label: s.name, value: String(s.id) })),
    [suppliers],
  );
  const outletOptions = useMemo(
    () => outlets.map((o) => ({ label: o.name, value: String(o.id) })),
    [outlets],
  );

  useEffect(() => {
    if (!scan || scan.toId || outletOptions.length === 0) return;
    setScan((current) => (current ? { ...current, toId: Number(outletOptions[0].value) } : current));
  }, [outletOptions, scan]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function scanFile(file: File, nextSource: InvoiceScanSourceType) {
    const revision = ++scanRevision.current;
    setError(null);
    setScan(null);
    setLoading(true);
    setSourceType(nextSource);
    try {
      const prepared = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
        ? file
        : await compressInvoicePhoto(file);
      const data = await scanInvoiceImage(prepared, prepared.name || (nextSource === "pdf" ? "invoice.pdf" : "invoice.jpg"));
      if (revision !== scanRevision.current) return;
      let supplierId = data.supplierId ?? null;
      if (!supplierId && data.supplierAbn) {
        try {
          const mapped = await suggestedInvoiceSupplierByAbn(data.supplierAbn);
          if (mapped) supplierId = mapped;
        } catch {
          /* optional ABN map */
        }
      }
      setScan({
        ...data,
        supplierId,
        invoiceDate: toIsoDate(data.invoiceDate),
        dueDate: toIsoDate(data.dueDate),
        createSupplier: false,
      });
    } catch (e) {
      if (revision !== scanRevision.current) return;
      if (e instanceof ApiError && e.code === 41001) {
        setInvoiceWorkflowRetired(true);
        setInvoiceVisionAvailable(false);
        setError("Invoice capture is not available in this Orithos-only store. Continue in Orithos Purchases or Replenishment.");
      } else {
        setError(apiFailureMessage(e, "Could not read that invoice.", "Please sign in again."));
      }
    } finally {
      if (revision === scanRevision.current) setLoading(false);
    }
  }

  async function onFile(file: File, nextSource: InvoiceScanSourceType) {
    ++scanRevision.current;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setSelectedFile(null);
      setPreview(null);
      setPreviewIsPdf(false);
      setScan(null);
      setLoading(false);
      setError("Choose a PDF or image file such as JPG, PNG or HEIC.");
      return;
    }
    if (file.size > MAX_INVOICE_BYTES) {
      setSelectedFile(null);
      setPreview(null);
      setPreviewIsPdf(false);
      setScan(null);
      setLoading(false);
      setError("That file is larger than 10 MB. Choose a smaller invoice.");
      return;
    }
    setSelectedFile(file);
    setError(null);
    setPreviewIsPdf(isPdf);
    setPreview(isPdf ? null : URL.createObjectURL(file));
    await scanFile(file, isPdf ? "pdf" : nextSource);
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

  async function saveDraft() {
    if (!scan) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await createInvoiceScan({
        sourceType,
        sourceFilename: selectedFile?.name ?? null,
        sourceContentType: selectedFile?.type ?? null,
        supplierName: scan.supplierName,
        supplierAbn: scan.supplierAbn,
        invoiceNumber: scan.invoiceNumber,
        invoiceDate: scan.invoiceDate,
        dueDate: scan.dueDate,
        totalPayable: scan.totalPayable,
        gstIncluded: scan.gstIncluded,
        supplierId: scan.supplierId ?? null,
        outletId: scan.toId ?? null,
        notes: scan.notes,
        internalNotes: scan.internalNotes,
        lines: (scan.lines ?? []).map((line) => ({
          description: line.description,
          brand: line.brand,
          packQty: line.packQty,
          qtyCases: line.qtyCases,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          productId: line.productId ?? null,
          matchStatus: line.productId ? "confirmed" : "unmatched",
        })),
      });
      router.push(`/invoices/${saved.id}`);
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not save this invoice draft.", "Please sign in again."));
    } finally {
      setSaving(false);
    }
  }

  const availabilityMessage = capabilityError
    ? " Could not check invoice AI availability — refresh and try again."
    : aiEnabled === null || invoiceVisionAvailable === null
      ? " Checking invoice AI availability…"
      : aiEnabled === false
        ? " Store AI is off — upload is unavailable."
        : invoiceVisionAvailable === false
          ? ` Invoice vision is unavailable for this store — use Orithos Purchases or Replenishment instead.${assistantAvailable ? " Orithos AI assistant remains available for questions." : ""}`
          : aiEnabled === true
            ? " Store AI is on — files are read for preview, then you can save a draft and receive stock."
            : "";

  const uploadDisabled = loading || capabilityError || aiEnabled === null || invoiceVisionAvailable === null || aiEnabled === false || invoiceVisionAvailable === false || invoiceWorkflowRetired;
  const lookupsReady = !suppliersError && !outletsError;
  const supplierSelectDisabled = suppliersLoading || !!suppliersError || supplierOptions.length === 0;
  const outletSelectDisabled = outletsLoading || !!outletsError || outletOptions.length === 0;

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Invoices</p>
              <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Scan supplier invoice</h1>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">
                Step 1 of 3: capture and review OCR. Saving does not put stock into Products — matching and receive come next.
              </p>
            </div>
            <Link href="/purchases?tab=invoices" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">
              Back to Purchasing
            </Link>
          </div>
          <InvoiceWorkflowSteps active="capture" />
          <div className="rounded-lg border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] px-3 py-2.5 text-sm leading-5 text-[var(--oh-tile-orange-text)]">
            OCR drafts stay in Orithos until you match lines and confirm. Confirm creates an Orithos RFQ → PO → receive for matched products only.
            {invoiceWorkflowRetired && " Invoice capture is retired for this Orithos-only store."}
            {availabilityMessage}
            {capabilityError && (
              <button
                type="button"
                onClick={() => void loadCapabilities()}
                disabled={capabilityLoading}
                className="ml-2 inline-flex min-h-8 items-center rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-surface-elevated)] px-2.5 text-xs font-semibold text-[var(--oh-tile-orange-text)] hover:bg-[var(--oh-tile-orange-bg)] disabled:cursor-wait disabled:opacity-60"
              >
                {capabilityLoading ? "Checking…" : "Retry availability"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          <section aria-labelledby="invoice-upload-title" aria-busy={loading} className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] p-4 sm:p-5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              aria-label="Choose a supplier invoice PDF or image"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file, "upload");
                e.target.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Photograph a supplier invoice"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file, "camera");
                e.target.value = "";
              }}
            />
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><FileImage size={21} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h2 id="invoice-upload-title" className="text-sm font-semibold text-[var(--oh-text)]">Upload or photograph</h2>
                  <p className="mt-1 text-sm leading-5 text-[var(--oh-muted)]">PDF (first pages), camera photo, or gallery image. Supplier API ingest is reserved for later.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => cameraRef.current?.click()} disabled={uploadDisabled} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">
                  {loading ? <LoaderCircle size={17} className="animate-spin" /> : <Camera size={17} />}
                  {loading ? "Reading invoice…" : "Photograph"}
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadDisabled} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)] disabled:cursor-wait disabled:opacity-60">
                  <FileText size={17} />
                  Upload PDF or image
                </button>
              </div>
            </div>
            {preview && !previewIsPdf && (
              <figure className="mt-4 flex flex-col items-start gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:items-center">
                <Image src={preview} alt="Invoice preview" width={640} height={256} unoptimized className="h-auto max-h-64 max-w-full rounded-lg border border-[var(--oh-border)] object-contain" />
                <figcaption className="text-xs text-[var(--oh-muted)]">Uploaded invoice image</figcaption>
              </figure>
            )}
            {previewIsPdf && selectedFile && (
              <p className="mt-4 border-t border-[var(--oh-border)] pt-4 text-sm text-[var(--oh-muted)]">PDF selected: {selectedFile.name}</p>
            )}
          </section>

          <AsyncDependencyNotice
            dependencies={[
              { label: "Suppliers", error: suppliersError, loading: suppliersLoading, onRetry: () => void loadSuppliers() },
              { label: "Outlets", error: outletsError, loading: outletsLoading, onRetry: () => void loadOutlets() },
            ]}
          />

          {loading && <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)] px-4 py-3 text-sm text-[var(--oh-tile-blue-text)]"><LoaderCircle size={17} className="animate-spin" />Reading the invoice and extracting line items…</div>}
          {error && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-3 text-sm leading-5 text-[var(--oh-tile-red-text)] sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {!invoiceWorkflowRetired && <button type="button" onClick={() => selectedFile && void scanFile(selectedFile, sourceType)} disabled={loading || !selectedFile} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-semibold text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)] disabled:cursor-wait disabled:opacity-60">{loading ? "Reading invoice…" : "Retry scan"}</button>}
            </div>
          )}

          {scan && (
            <>
              <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
                <div className="mb-4 border-b border-[var(--oh-border)] pb-3">
                  <h2 className="text-sm font-semibold text-[var(--oh-text)]">Invoice details</h2>
                  <p className="mt-1 text-xs text-[var(--oh-muted)]">
                    Check supplier and document totals, then save a draft to continue matching and receiving.
                    {!lookupsReady && " Lookup lists are unavailable until Orithos options reload."}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col">
                    <span className={labelClass}>Supplier</span>
                    <div className="relative">
                      <select
                        value={scan.supplierId ? String(scan.supplierId) : ""}
                        onChange={(e) => patch({ supplierId: e.target.value ? Number(e.target.value) : null, createSupplier: false })}
                        disabled={supplierSelectDisabled}
                        className={`${fieldClass} appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70`}
                      >
                        <option value="">{scan.supplierName ? `Use OCR name: “${scan.supplierName}”` : "Select matched supplier…"}</option>
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
                        disabled={outletSelectDisabled}
                        className={`${fieldClass} appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70`}
                      >
                        {outletOptions.length === 0 && <option value="">No outlets available</option>}
                        {outletOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <SelectChevronIcon size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                    </div>
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col"><span className={labelClass}>Invoice number</span><input value={scan.invoiceNumber ?? ""} onChange={(e) => patch({ invoiceNumber: e.target.value })} className={fieldClass} /></label>
                  <label className="flex flex-col"><span className={labelClass}>Invoice date</span><input type="date" value={toIsoDate(scan.invoiceDate)} onChange={(e) => patch({ invoiceDate: e.target.value })} className={fieldClass} /></label>
                  <label className="flex flex-col"><span className={labelClass}>Due date</span><input type="date" value={toIsoDate(scan.dueDate)} onChange={(e) => patch({ dueDate: e.target.value })} className={fieldClass} /></label>
                  <label className="flex flex-col"><span className={labelClass}>Total payable</span><input readOnly value={money(scan.totalPayable)} className={`${fieldClass} bg-[var(--oh-surface)] font-semibold tabular-nums`} /></label>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
                <header className="border-b border-[var(--oh-border)] px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2"><ReceiptText size={17} className="text-[var(--oh-primary)]" /><h2 className="text-sm font-semibold text-[var(--oh-text)]">Invoice line items</h2></div>
                  <p className="mt-1 text-xs text-[var(--oh-muted)]">Review descriptions and quantities. Product matching continues after you save the draft.</p>
                </header>
                <div className="hidden overflow-x-auto md:block">
                  <table aria-label="Invoice OCR line items" className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3">Product</th><th scope="col" className="px-4 py-3 text-right">Pack</th><th scope="col" className="px-4 py-3 text-right">Cases</th><th scope="col" className="px-4 py-3 text-right">Price</th><th scope="col" className="px-4 py-3 text-right">Total</th></tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">
                      {(scan.lines ?? []).map((line, index) => (
                        <tr key={`${line.description}-${index}`} className="hover:bg-[var(--oh-surface)]/60">
                          <td className="px-4 py-2.5"><input aria-label={`Product description ${index + 1}`} value={line.description ?? ""} onChange={(e) => patchLine(index, { description: e.target.value })} className="h-10 w-full min-w-48 rounded-lg border border-[var(--oh-border)] px-2.5 text-sm outline-none focus:border-[var(--oh-primary)]" /></td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{line.packQty ?? "—"}</td>
                          <td className="px-4 py-2.5"><input aria-label={`Cases for line ${index + 1}`} type="number" min="0" step="0.01" value={line.qtyCases ?? ""} onChange={(e) => patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })} className="h-10 w-24 rounded-lg border border-[var(--oh-border)] px-2.5 text-right tabular-nums outline-none focus:border-[var(--oh-primary)]" /></td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(line.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(line.lineTotal)}</td>
                        </tr>
                      ))}
                      {!scan.lines?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--oh-muted)]">No line items were detected on this invoice.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-[var(--oh-border)] md:hidden">
                  {(scan.lines ?? []).map((line, index) => (
                    <article key={`${line.description}-${index}`} className="space-y-3 p-4">
                      <label className="block"><span className={labelClass}>Product</span><input aria-label={`Product description ${index + 1}`} value={line.description ?? ""} onChange={(e) => patchLine(index, { description: e.target.value })} className={fieldClass} /></label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2"><p className="text-xs text-[var(--oh-muted)]">Pack</p><p className="mt-1 text-sm tabular-nums">{line.packQty ?? "—"}</p></div>
                        <label><span className={labelClass}>Cases</span><input aria-label={`Cases for line ${index + 1}`} type="number" min="0" step="0.01" value={line.qtyCases ?? ""} onChange={(e) => patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })} className={fieldClass} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--oh-muted)]">{scan ? "Next: match each line to Products, then confirm to receive stock." : "Choose a PDF or photo to begin."}</p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link href="/purchases?tab=invoices" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)]">Cancel</Link>
            <button type="button" onClick={() => void saveDraft()} disabled={!scan || saving || loading} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">
              {saving ? "Saving…" : "Save draft → match products"}
            </button>
          </div>
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
