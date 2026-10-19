"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isLiquorProduct } from "@/lib/au";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { BARCODE_FORMAT_HINT, validateBarcode } from "@/lib/barcode";
import {
  parsePositiveQuantity,
  validateNonNegativeMoney,
  validatePositiveMoney,
  validatePositiveQuantity,
} from "@/lib/quantity";
import { useApi, useDebouncedValue } from "@/hooks/useApi";
import { AsyncDependencyNotice, AsyncState } from "@/components/admin/AsyncState";
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { uniqueSelectOptions } from "@/components/admin/FilterSelect";
import {
  ArrowLeftIcon,
  AwardIcon,
  BarcodeIcon,
  DeleteIcon,
  DollarIcon,
  EditIcon,
  FileImageIcon,
  PlusIcon,
  SelectChevronIcon,
  TagIcon,
  TruckIcon,
  UserIcon,
  MapPinIcon,
  WarehouseIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface Named {
  id: string | number;
  name: string;
}

interface ProductBarcodeRow {
  id: string | number;
  code: string;
}

interface BarcodeAvailability {
  available: boolean;
  productName: string | null;
}

interface ProductPriceRow {
  id?: string | number;
  quantity?: number | null;
  price?: number | null;
}

interface ProductInventoryRow {
  outletId: string | number;
  outletName: string;
  quantity?: number | null;
  reorderLevel?: number | null;
  reorderAmount?: number | null;
  reorderLimit?: number | null;
  maxQuantity?: number | null;
  reorderRounding?: string | null;
}

type InventoryField =
  | "quantity"
  | "reorderLevel"
  | "reorderAmount"
  | "reorderLimit"
  | "maxQuantity";

export interface ProductDetail {
  id: string;
  name: string;
  type?: string;
  status?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  familyId?: string;
  taxRateId?: string;
  costTaxRateId?: string;
  cost?: number | null;
  price?: number | null;
  caseQuantity?: number | null;
  costPercentage?: boolean;
  preventManualDiscounts?: boolean;
  requestPrice?: boolean;
  requestQuantity?: boolean;
  trackInventory?: boolean;
  showShortcuts?: boolean;
  abv?: number | null;
  volumeMl?: number | null;
  region?: string | null;
  vintage?: string | null;
  image?: string;
  categoryName?: string;
  brandName?: string;
  tagIds?: (string | number)[];
  supplierIds?: (string | number)[];
  barcodes?: ProductBarcodeRow[];
  stockQuantity?: number | null;
  prices?: ProductPriceRow[];
  familyMemberNames?: string[];
}

type TabId =
  | "general"
  | "classifications"
  | "sell-cost"
  | "inventory"
  | "barcodes"
  | "suppliers"
  | "images"
  | "loyalty";

const TABS: { id: TabId; label: string; Icon: typeof UserIcon }[] = [
  { id: "general", label: "General", Icon: UserIcon },
  { id: "classifications", label: "Classifications", Icon: TagIcon },
  { id: "sell-cost", label: "Sell & Cost", Icon: DollarIcon },
  { id: "inventory", label: "Inventory", Icon: WarehouseIcon },
  { id: "barcodes", label: "Barcodes", Icon: BarcodeIcon },
  { id: "suppliers", label: "Suppliers", Icon: TruckIcon },
  { id: "images", label: "Images", Icon: FileImageIcon },
  { id: "loyalty", label: "Loyalty", Icon: AwardIcon },
];

const TYPE_OPTIONS = [
  { label: "Normal Product", value: "STANDARD" },
  { label: "Variant", value: "VARIANT" },
  { label: "Composite", value: "COMPOSITE" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
];

const REORDER_ROUNDING_OPTIONS = [
  { label: "No Rounding", value: "NONE" },
  { label: "Round to Case", value: "CASE" },
  { label: "Round to Item", value: "ITEM" },
];

const INVENTORY_ROWS: { field: InventoryField; label: string }[] = [
  { field: "quantity", label: "Current Stock" },
  { field: "reorderLevel", label: "Reorder Level" },
  { field: "reorderAmount", label: "Reorder Amount" },
  { field: "reorderLimit", label: "Reorder Limit" },
  { field: "maxQuantity", label: "Max On Hand" },
];

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

const selectTriggerClass =
  "flex h-10 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

function FormField({
  label,
  help,
  required,
  children,
}: {
  label: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--oh-border)] py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[var(--oh-text)]">{label}</div>
          {help && <p className="mt-1 text-[13px] leading-relaxed text-[var(--oh-muted)]">{help}</p>}
        </div>
        {required && (
          <span className="shrink-0 text-[14px] text-[var(--oh-orange)]" title="Required">
            ★
          </span>
        )}
      </div>
      <div className="mt-3 max-w-2xl">{children}</div>
    </div>
  );
}

function FormSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uniqueOptions = useMemo(() => {
    const deduped = uniqueSelectOptions(options);
    if (!value) return deduped;
    const current = options.find((o) => String(o.value) === String(value));
    if (!current) return deduped;
    if (deduped.some((o) => String(o.value) === String(value))) return deduped;
    // Prefer the currently selected id when the same label appears more than once.
    const labelKey = String(current.label ?? "").trim().toLowerCase();
    const currentOpt = {
      label: String(current.label ?? "").trim(),
      value: String(current.value),
    };
    const idx = deduped.findIndex((o) => o.label.toLowerCase() === labelKey);
    if (idx >= 0) {
      const next = [...deduped];
      next[idx] = currentOpt;
      return next;
    }
    return [currentOpt, ...deduped];
  }, [options, value]);
  const selected = uniqueOptions.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${selectTriggerClass} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
          {selected?.label ?? placeholder}
        </span>
        <SelectChevronIcon
          size={16}
          className={`text-[var(--oh-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && !disabled && (
        <ul className="absolute z-[200] mt-1 max-h-56 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
          {uniqueOptions.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-[var(--oh-muted)]">No options available</li>
          ) : (
            uniqueOptions.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--oh-surface)] ${
                    String(o.value) === String(value) ? "bg-[var(--oh-orange-light)]/40 font-medium" : ""
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function FormToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Toggle product status"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function MoneyInput({
  value,
  onChange,
  className,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative max-w-[200px]", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
        $
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num) || num < 0) return;
          onChange(num);
        }}
        className={`${inputClass} pl-7`}
      />
    </div>
  );
}

function marginPercent(price?: number | null, unitCost?: number | null, quantity?: number | null) {
  const p = price ?? 0;
  const c = (unitCost ?? 0) * (quantity ?? 1);
  if (!p || p <= 0) return "";
  return `${(((p - c) / p) * 100).toFixed(2)} %`;
}

function toOptions(rows?: Named[] | null) {
  return (rows ?? []).map((r) => ({ label: r.name, value: String(r.id) }));
}

function strId(v?: string | number | null) {
  return v === null || v === undefined ? "" : String(v);
}

/** Send numeric IDs when safe; keep string for large snowflake IDs. */
function toApiId(v?: string | null) {
  if (!v) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : v;
}

function toApiNumber(v?: number | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v;
}

function splitCasesItems(total?: number | null, caseQuantity?: number | null) {
  const value = Number(total ?? 0);
  const caseQty = Number(caseQuantity ?? 0);
  if (Number.isFinite(caseQty) && caseQty > 0 && Number.isFinite(value)) {
    const cases = Math.floor(value / caseQty);
    return { cases, items: value - cases * caseQty };
  }
  return { cases: 0, items: Number.isFinite(value) ? value : 0 };
}

function mergeCasesItems(
  cases?: number | null,
  items?: number | null,
  caseQuantity?: number | null,
) {
  const caseQty = caseQuantity ?? 0;
  if (caseQty > 0) {
    return (cases ?? 0) * caseQty + (items ?? 0);
  }
  return items ?? 0;
}

function applyInventoryToForm(rows?: ProductInventoryRow[] | null): ProductInventoryRow[] {
  return (rows ?? []).map((row) => ({
    ...row,
    quantity: row.quantity != null ? Number(row.quantity) : 0,
    reorderLevel: row.reorderLevel != null ? Number(row.reorderLevel) : null,
    reorderAmount: row.reorderAmount != null ? Number(row.reorderAmount) : null,
    reorderLimit: row.reorderLimit != null ? Number(row.reorderLimit) : null,
    maxQuantity: row.maxQuantity != null ? Number(row.maxQuantity) : null,
    reorderRounding: row.reorderRounding ?? "NONE",
  }));
}

function applyProductToForm(product: ProductDetail): ProductDetail {
  return {
    ...product,
    price: product.price != null ? Number(product.price) : null,
    cost: product.cost != null ? Number(product.cost) : null,
    caseQuantity: product.caseQuantity != null ? Number(product.caseQuantity) : null,
    stockQuantity: product.stockQuantity != null ? Number(product.stockQuantity) : null,
    categoryId: strId(product.categoryId),
    brandId: strId(product.brandId),
    familyId: strId(product.familyId),
    taxRateId: strId(product.taxRateId),
    costTaxRateId: strId(product.costTaxRateId),
    costPercentage: product.costPercentage ?? false,
    preventManualDiscounts: product.preventManualDiscounts ?? false,
    requestPrice: product.requestPrice ?? false,
    requestQuantity: product.requestQuantity ?? false,
    showShortcuts: product.showShortcuts ?? false,
    abv: product.abv != null ? Number(product.abv) : null,
    volumeMl: product.volumeMl != null ? Number(product.volumeMl) : null,
    region: product.region ?? "",
    vintage: product.vintage ?? "",
    prices: (product.prices ?? []).map((row) => ({
      ...row,
      id: row.id,
      quantity: row.quantity != null ? Number(row.quantity) : null,
      price: row.price != null ? Number(row.price) : null,
    })),
  };
}

function productEditSnapshot(
  form: ProductDetail,
  inventoryRows: ProductInventoryRow[],
  barcode: string,
  tagId: string,
  supplierId: string,
) {
  return JSON.stringify({
    name: form.name,
    status: form.status ?? "ACTIVE",
    description: form.description ?? "",
    caseQuantity: form.caseQuantity,
    brandId: form.brandId ?? "",
    categoryId: form.categoryId ?? "",
    familyId: form.familyId ?? "",
    taxRateId: form.taxRateId ?? "",
    costTaxRateId: form.costTaxRateId ?? "",
    cost: form.cost,
    price: form.price,
    costPercentage: form.costPercentage ?? false,
    preventManualDiscounts: form.preventManualDiscounts ?? false,
    requestPrice: form.requestPrice ?? false,
    requestQuantity: form.requestQuantity ?? false,
    showShortcuts: form.showShortcuts ?? false,
    abv: form.abv ?? null,
    volumeMl: form.volumeMl ?? null,
    region: form.region ?? "",
    vintage: form.vintage ?? "",
    trackInventory: form.trackInventory ?? true,
    image: form.image ?? "",
    prices: (form.prices ?? []).map((row) => ({
      id: row.id,
      quantity: row.quantity,
      price: row.price,
    })),
    inventory: inventoryRows.map((row) => ({
      outletId: row.outletId,
      quantity: row.quantity,
      reorderLevel: row.reorderLevel,
      reorderAmount: row.reorderAmount,
      reorderLimit: row.reorderLimit,
      maxQuantity: row.maxQuantity,
      reorderRounding: row.reorderRounding ?? "NONE",
    })),
    barcode: barcode.trim(),
    tagId,
    supplierId,
  });
}

export function EditProductPage({ productId }: { productId: string }) {
  const router = useRouter();
  const { setDirty, confirmNavigation, registerDirtyChecker } = useUnsavedChanges();
  const [tab, setTab] = useState<TabId>("general");
  const [form, setForm] = useState<ProductDetail | null>(null);
  const [barcode, setBarcode] = useState("");
  const debouncedBarcode = useDebouncedValue(barcode, 300);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  const [caseQtyEditing, setCaseQtyEditing] = useState(false);
  const [caseQtyDraft, setCaseQtyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [tagId, setTagId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [showCostsIncludingTax, setShowCostsIncludingTax] = useState(true);
  const [inventoryRows, setInventoryRows] = useState<ProductInventoryRow[]>([]);
  const editBaselineRef = useRef<string | null>(null);
  const awaitingBaselineResetRef = useRef(false);

  useEffect(() => {
    editBaselineRef.current = null;
  }, [productId]);

  const { data: product, loading, error, reload } = useApi<ProductDetail>(
    productId ? `/api/products/${productId}` : null,
  );

  const {
    data: inventoryData,
    loading: inventoryLoading,
    error: inventoryError,
    reload: reloadInventory,
  } = useApi<ProductInventoryRow[]>(
    productId ? `/api/products/${productId}/inventory` : null,
  );

  const brands = useApi<Named[]>("/api/classifications/brand");
  const categories = useApi<Named[]>("/api/classifications/category");
  const families = useApi<Named[]>("/api/classifications/family");
  const tags = useApi<Named[]>("/api/classifications/tag");
  const taxRates = useApi<Named[]>("/api/tax-rates");
  const suppliers = useApi<{ items: Named[] }>("/api/suppliers", { size: 200 });

  useEffect(() => {
    if (product) {
      setForm(applyProductToForm(product));
      setCaseQtyDraft(strId(product.caseQuantity));
      const firstTag = product.tagIds?.[0];
      setTagId(firstTag !== undefined && firstTag !== null ? String(firstTag) : "");
      const firstSupplier = product.supplierIds?.[0];
      setSupplierId(
        firstSupplier !== undefined && firstSupplier !== null ? String(firstSupplier) : "",
      );
    }
  }, [product]);

  useEffect(() => {
    if (inventoryData) {
      setInventoryRows(applyInventoryToForm(inventoryData));
    }
  }, [inventoryData]);

  useEffect(() => {
    const trimmed = debouncedBarcode.trim();
    if (!trimmed) {
      setBarcodeError(null);
      setBarcodeChecking(false);
      return;
    }

    const formatError = validateBarcode(trimmed);
    if (formatError) {
      setBarcodeError(formatError);
      setBarcodeChecking(false);
      return;
    }

    if (form?.barcodes?.some((row) => row.code === trimmed)) {
      setBarcodeError("This barcode is already linked to this product.");
      setBarcodeChecking(false);
      return;
    }

    let cancelled = false;
    setBarcodeChecking(true);
    setBarcodeError(null);

    api
      .get<BarcodeAvailability>("/api/products/barcodes/check", {
        code: trimmed,
        excludeProductId: productId,
      })
      .then((result) => {
        if (cancelled) return;
        if (!result.available) {
          setBarcodeError(
            result.productName
              ? `This barcode is already assigned to "${result.productName}".`
              : "This barcode is already assigned to another product.",
          );
        } else {
          setBarcodeError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBarcodeError(null);
      })
      .finally(() => {
        if (!cancelled) setBarcodeChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedBarcode, form?.barcodes, productId]);

  useEffect(() => {
    if (!product || inventoryLoading || inventoryData === undefined) return;
    if (editBaselineRef.current !== null) return;
    const formFromProduct = applyProductToForm(product);
    const firstTag = product.tagIds?.[0];
    const tag = firstTag !== undefined && firstTag !== null ? String(firstTag) : "";
    const firstSupplier = product.supplierIds?.[0];
    const supplier =
      firstSupplier !== undefined && firstSupplier !== null ? String(firstSupplier) : "";
    editBaselineRef.current = productEditSnapshot(
      formFromProduct,
      applyInventoryToForm(inventoryData),
      "",
      tag,
      supplier,
    );
  }, [product, inventoryData, inventoryLoading]);

  const checkDirty = useCallback(() => {
    if (!form || !editBaselineRef.current) return false;
    return (
      productEditSnapshot(form, inventoryRows, barcode, tagId, supplierId) !==
      editBaselineRef.current
    );
  }, [form, inventoryRows, barcode, tagId, supplierId]);

  const syncEditBaseline = useCallback(
    (
      baselineForm: ProductDetail,
      baselineInventory: ProductInventoryRow[],
      baselineBarcode: string,
      baselineTagId: string,
      baselineSupplierId: string,
    ) => {
      editBaselineRef.current = productEditSnapshot(
        baselineForm,
        baselineInventory,
        baselineBarcode,
        baselineTagId,
        baselineSupplierId,
      );
      setDirty(false);
    },
    [setDirty],
  );

  useEffect(() => {
    if (!awaitingBaselineResetRef.current) return;
    if (loading || inventoryLoading || !form) return;
    syncEditBaseline(form, inventoryRows, barcode, tagId, supplierId);
    awaitingBaselineResetRef.current = false;
  }, [
    loading,
    inventoryLoading,
    form,
    inventoryRows,
    barcode,
    tagId,
    supplierId,
    syncEditBaseline,
  ]);

  useLayoutEffect(() => {
    registerDirtyChecker(checkDirty);
    setDirty(checkDirty());
    return () => {
      registerDirtyChecker(null);
      setDirty(false);
    };
  }, [checkDirty, registerDirtyChecker, setDirty]);

  function leavePage() {
    confirmNavigation(() => router.push("/products"), checkDirty());
  }

  if (!form && !loading && !error) return null;

  const set = (patch: Partial<ProductDetail>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function updateInventoryField(
    outletIndex: number,
    field: InventoryField,
    part: "cases" | "items",
    raw: string,
  ) {
    setInventoryRows((rows) => {
      const next = [...rows];
      const row = { ...next[outletIndex] };
      const current = row[field] as number | null | undefined;
      const { cases, items } = splitCasesItems(current, form?.caseQuantity);
      const parsed = raw === "" ? null : Number(raw);
      const newCases = part === "cases" ? parsed : cases;
      const newItems = part === "items" ? parsed : items;
      row[field] = mergeCasesItems(newCases, newItems, form?.caseQuantity);
      next[outletIndex] = row;
      return next;
    });
  }

  function updateInventoryRounding(outletIndex: number, reorderRounding: string) {
    setInventoryRows((rows) => {
      const next = [...rows];
      next[outletIndex] = { ...next[outletIndex], reorderRounding };
      return next;
    });
  }

  async function save() {
    if (!form) return;

    const barcodeFormatError = validateBarcode(barcode);
    if (barcodeFormatError) {
      setSaveError(barcodeFormatError);
      setTab("barcodes");
      return;
    }

    const trimmedBarcode = barcode.trim();
    if (trimmedBarcode) {
      if (form.barcodes?.some((row) => row.code === trimmedBarcode)) {
        setSaveError("This barcode is already linked to this product.");
        setTab("barcodes");
        return;
      }
      if (barcodeChecking || barcodeError) {
        setSaveError(barcodeError ?? "Checking barcode availability…");
        setTab("barcodes");
        return;
      }
    }

    for (const row of form.prices ?? []) {
      if (row.price == null && row.quantity == null) continue;
      const priceQtyError = validatePositiveQuantity(
        row.quantity != null ? String(row.quantity) : "",
        "Price quantity",
      );
      if (priceQtyError) {
        setSaveError(priceQtyError);
        setTab("sell-cost");
        return;
      }
      if (row.price == null) {
        setSaveError("Price is required.");
        setTab("sell-cost");
        return;
      }
      const priceError = validatePositiveMoney(row.price, "Price");
      if (priceError) {
        setSaveError(priceError);
        setTab("sell-cost");
        return;
      }
    }

    if (!form.requestPrice) {
      const hasPositivePrice =
        (form.price != null && form.price > 0) ||
        (form.prices ?? []).some((row) => row.price != null && row.price > 0);
      if (!hasPositivePrice) {
        setSaveError("Price is required and must be greater than zero.");
        setTab("sell-cost");
        return;
      }
    }
    if (form.price != null) {
      const defaultPriceError = validatePositiveMoney(form.price, "Price");
      if (defaultPriceError) {
        setSaveError(defaultPriceError);
        setTab("sell-cost");
        return;
      }
    }

    const costError = validateNonNegativeMoney(form.cost, "Cost");
    if (costError) {
      setSaveError(costError);
      setTab("sell-cost");
      return;
    }

    const categoryName =
      categories.data?.find((c) => String(c.id) === String(form.categoryId))?.name ??
      form.categoryName ??
      "";
    if (isLiquorProduct(form.name, categoryName)) {
      if (form.abv == null || Number.isNaN(Number(form.abv))) {
        setSaveError("Alcohol by volume (ABV %) is required for liquor products.");
        setTab("sell-cost");
        return;
      }
      if (form.abv < 0 || form.abv > 100) {
        setSaveError("ABV must be between 0 and 100.");
        setTab("sell-cost");
        return;
      }
    }
    if (form.volumeMl != null && (form.volumeMl < 1 || form.volumeMl > 20000)) {
      setSaveError("Volume must be between 1 and 20000 ml.");
      setTab("sell-cost");
      return;
    }
    const vintage = form.vintage?.trim() ?? "";
    if (vintage && !/^(?:NV|\d{4})$/i.test(vintage)) {
      setSaveError("Vintage must be a four-digit year or NV.");
      setTab("sell-cost");
      return;
    }

    setBusy(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        status: form.status ?? "ACTIVE",
        description: form.description ?? "",
        categoryId: toApiId(form.categoryId),
        brandId: toApiId(form.brandId),
        familyId: toApiId(form.familyId),
        taxRateId: toApiId(form.taxRateId),
        costTaxRateId: form.costTaxRateId ? toApiId(form.costTaxRateId) : null,
        cost: toApiNumber(form.cost),
        price: toApiNumber(form.price),
        caseQuantity: toApiNumber(form.caseQuantity),
        costPercentage: form.costPercentage ?? false,
        preventManualDiscounts: form.preventManualDiscounts ?? false,
        requestPrice: form.requestPrice ?? false,
        requestQuantity: form.requestQuantity ?? false,
        showShortcuts: form.showShortcuts ?? false,
        abv: form.abv ?? null,
        volumeMl: form.volumeMl ?? null,
        region: form.region?.trim() ? form.region.trim() : null,
        vintage: form.vintage?.trim() ? form.vintage.trim().toUpperCase() : null,
        trackInventory: form.trackInventory ?? true,
        image: form.image ?? null,
      };

      const updated = await api.put<ProductDetail>(`/api/products/${productId}`, body);
      if (updated) {
        setForm(applyProductToForm(updated));
      }

      // Dedicated price endpoint keeps compatibility with older backend builds.
      if (form.price !== null && form.price !== undefined) {
        await api.put(`/api/products/${productId}/price`, { price: form.price });
      }

      if (form.prices) {
        await api.put(`/api/products/${productId}/prices`, {
          prices: form.prices
            .filter((row) => row.quantity != null && row.price != null)
            .map((row) => ({
              id: row.id != null ? toApiId(String(row.id)) : null,
              quantity: row.quantity,
              price: row.price,
            })),
        });
      }

      await api.put(`/api/products/${productId}/tags`, {
        tagIds: tagId ? [toApiId(tagId)] : [],
      });
      await api.put(`/api/products/${productId}/suppliers`, {
        supplierIds: supplierId ? [toApiId(supplierId)] : [],
      });

      if (barcode.trim()) {
        await api.post(`/api/products/${productId}/barcodes`, { barcode: barcode.trim() });
      }

      if (inventoryRows.length > 0) {
        await api.put(`/api/products/${productId}/inventory`, {
          rows: inventoryRows.map((row) => ({
            outletId: toApiId(String(row.outletId)),
            quantity: row.quantity ?? 0,
            reorderLevel: toApiNumber(row.reorderLevel),
            reorderAmount: toApiNumber(row.reorderAmount),
            reorderLimit: toApiNumber(row.reorderLimit),
            maxQuantity: toApiNumber(row.maxQuantity),
            reorderRounding: row.reorderRounding ?? "NONE",
          })),
        });
      }

      setBarcode("");
      syncEditBaseline(form, inventoryRows, "", tagId, supplierId);
      awaitingBaselineResetRef.current = true;
      setSaveOk(true);
      reload();
      reloadInventory();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setBusy(false);
    }
  }

  async function removeBarcode(barcodeId: string | number) {
    setBusy(true);
    setSaveError(null);
    try {
      await api.del(`/api/products/${productId}/barcodes`, [barcodeId]);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to remove barcode");
    } finally {
      setBusy(false);
    }
  }

  const barcodeBlocksSave =
    barcode.trim() !== "" && (barcodeChecking || !!barcodeError);

  const productName = form?.name?.trim() || "Product";

  return (
    <div aria-busy={loading || inventoryLoading} className="h-full overflow-auto bg-[var(--oh-surface)] p-5 font-sans md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={leavePage}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
        >
          <ArrowLeftIcon size={16} />
          Back to Products
        </button>
      </div>

      <h1 className="text-center text-[20px] font-semibold text-[var(--oh-text)] md:text-[22px]">
        Editing <span className="text-[var(--oh-orange)]">{productName}</span>
      </h1>

      {/* Tabs */}
      <div className="mx-auto mt-5 max-w-5xl">
        <div className="flex flex-wrap gap-1 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white/60 p-1 shadow-[var(--oh-shadow-card)]">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-white text-[var(--oh-text)] shadow-sm"
                    : "text-[var(--oh-muted)] hover:bg-white/80 hover:text-[var(--oh-text-secondary)]"
                }`}
              >
                <Icon size={14} strokeWidth={1.75} />
                {label}
              </button>
            );
          })}
        </div>

        <AsyncState loading={loading} error={error} empty={false} onRetry={reload}>
          {form && (
            <div className="mt-4 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-5 py-2 shadow-[var(--oh-shadow-card)] md:px-6">
              <AsyncDependencyNotice
                dependencies={[
                  { label: "Brands", error: brands.error, loading: brands.loading, onRetry: brands.reload },
                  { label: "Categories", error: categories.error, loading: categories.loading, onRetry: categories.reload },
                  { label: "Families", error: families.error, loading: families.loading, onRetry: families.reload },
                  { label: "Tags", error: tags.error, loading: tags.loading, onRetry: tags.reload },
                  { label: "Tax rates", error: taxRates.error, loading: taxRates.loading, onRetry: taxRates.reload },
                  { label: "Suppliers", error: suppliers.error, loading: suppliers.loading, onRetry: suppliers.reload },
                ]}
              />
              {/* Section title */}
              <div className="flex items-center gap-2 border-b border-[var(--oh-border)] py-4">
                {(() => {
                  const current = TABS.find((t) => t.id === tab)!;
                  return (
                    <>
                      <current.Icon size={18} className="text-[var(--oh-orange)]" strokeWidth={1.75} />
                      <h2 className="text-[16px] font-semibold text-[var(--oh-text)]">{current.label}</h2>
                    </>
                  );
                })()}
              </div>

              {tab === "general" && (
                <>
                  <FormField
                    label="Name"
                    help="The name of the product — this will appear throughout Orithos and will be visible to customers"
                    required
                  >
                    <input
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Show Shortcuts"
                    help={
                      form.showShortcuts
                        ? "Shortcut keys for this product are shown on the sell screen"
                        : "Shortcut keys for this product are hidden on the sell screen"
                    }
                  >
                    <FormToggle
                      checked={form.showShortcuts ?? false}
                      onChange={(showShortcuts) => set({ showShortcuts })}
                    />
                  </FormField>

                  <FormField
                    label="Type"
                    help="Determines how a product is sold and whether it contains other products. Under most circumstances this should be a Normal Product"
                  >
                    <FormSelect
                      value={form.type ?? "STANDARD"}
                      options={TYPE_OPTIONS}
                      onChange={() => {}}
                      disabled
                    />
                  </FormField>

                  <FormField
                    label="Status"
                    help="Whether this product is a regularly stocked product, one you're removing from the store, or one you're unable to sell yet"
                  >
                    <FormSelect
                      value={form.status ?? "ACTIVE"}
                      options={STATUS_OPTIONS}
                      onChange={(status) => set({ status })}
                    />
                  </FormField>

                  <FormField
                    label="Description"
                    help="A text description of the product — commonly used when connecting an eCommerce store"
                  >
                    <textarea
                      value={form.description ?? ""}
                      onChange={(e) => set({ description: e.target.value })}
                      rows={5}
                      className={`${inputClass} min-h-[120px] resize-y py-2`}
                      placeholder="Product description…"
                    />
                  </FormField>

                  <FormField
                    label="Case Quantity"
                    help="The number of items that come in a case / outer"
                  >
                    <div className="flex items-center gap-3">
                      {caseQtyEditing ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            autoFocus
                            value={caseQtyDraft}
                            onChange={(e) => setCaseQtyDraft(e.target.value)}
                            className={`${inputClass} max-w-[160px]`}
                          />
                          <AdminPrimaryButton
                            onClick={() => {
                              set({ caseQuantity: caseQtyDraft ? Number(caseQtyDraft) : null });
                              setCaseQtyEditing(false);
                            }}
                          >
                            Apply
                          </AdminPrimaryButton>
                          <AdminSecondaryButton onClick={() => setCaseQtyEditing(false)}>
                            Cancel
                          </AdminSecondaryButton>
                        </>
                      ) : (
                        <>
                          <input
                            readOnly
                            value={form.caseQuantity ?? ""}
                            className={`${inputClass} max-w-[160px] cursor-default bg-[var(--oh-surface)] opacity-80`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setCaseQtyDraft(strId(form.caseQuantity));
                              setCaseQtyEditing(true);
                            }}
                            className="flex items-center gap-1.5 rounded-[var(--oh-radius)] bg-[var(--oh-success)] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:opacity-90"
                          >
                            <EditIcon size={14} />
                            Edit Case Quantity
                          </button>
                        </>
                      )}
                    </div>
                  </FormField>
                </>
              )}

              {tab === "classifications" && (
                <>
                  <FormField label="Brand" help="The brand this product belongs to">
                    <FormSelect
                      value={form.brandId ?? ""}
                      options={toOptions(brands.data)}
                      onChange={(brandId) => set({ brandId })}
                    />
                  </FormField>
                  <FormField label="Category" help="The category used to organise this product">
                    <FormSelect
                      value={form.categoryId ?? ""}
                      options={toOptions(categories.data)}
                      onChange={(categoryId) => set({ categoryId })}
                    />
                  </FormField>
                  <FormField label="Family" help="Product family grouping for reporting and filtering">
                    <FormSelect
                      value={form.familyId ?? ""}
                      options={toOptions(families.data)}
                      onChange={(familyId) => set({ familyId })}
                    />
                  </FormField>
                  <FormField label="Tags" help="Tags help filter and organise products across the catalogue">
                    <FormSelect
                      value={tagId}
                      options={toOptions(tags.data)}
                      onChange={setTagId}
                      placeholder="Select a tag to associate…"
                    />
                  </FormField>
                </>
              )}

              {tab === "sell-cost" && (
                <>
                  <FormField
                    label="Retail Tax Rate"
                    help="The tax this product accrues when selling it"
                  >
                    <FormSelect
                      value={form.taxRateId ?? ""}
                      options={toOptions(taxRates.data)}
                      onChange={(taxRateId) => set({ taxRateId })}
                      placeholder="Select…"
                    />
                  </FormField>

                  <FormField
                    label="ABV %"
                    help="Alcohol by volume. Required for wine, beer and spirits sold in Australia."
                  >
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.abv ?? ""}
                      onChange={(e) =>
                        set({ abv: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      placeholder={
                        isLiquorProduct(
                          form.name,
                          categories.data?.find((c) => String(c.id) === String(form.categoryId))?.name ??
                            form.categoryName,
                        )
                          ? "Required, e.g. 14.5"
                          : "Only for liquor"
                      }
                      className={`${inputClass} max-w-[160px]`}
                    />
                  </FormField>

                  <FormField
                    label="Volume (ml)"
                    help="Container size. Used for liquor labelling and catalogue filters."
                  >
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      step="1"
                      value={form.volumeMl ?? ""}
                      onChange={(e) =>
                        set({ volumeMl: e.target.value === "" ? null : Number(e.target.value) })
                      }
                      placeholder="e.g. 375"
                      className={`${inputClass} max-w-[160px]`}
                    />
                  </FormField>

                  <FormField
                    label="Region"
                    help="Wine region or place of origin, such as Barossa Valley."
                  >
                    <input
                      type="text"
                      maxLength={128}
                      value={form.region ?? ""}
                      onChange={(e) => set({ region: e.target.value })}
                      placeholder="e.g. Barossa Valley"
                      className={`${inputClass} max-w-md`}
                    />
                  </FormField>

                  <FormField
                    label="Vintage"
                    help="Four-digit year, or NV for non-vintage."
                  >
                    <input
                      type="text"
                      maxLength={16}
                      value={form.vintage ?? ""}
                      onChange={(e) => set({ vintage: e.target.value })}
                      placeholder="e.g. 2021 or NV"
                      className={`${inputClass} max-w-[160px]`}
                    />
                  </FormField>

                  <FormField
                    label="Purchase Tax Rate"
                    help="The tax this product accrues when purchasing it"
                  >
                    <FormSelect
                      value={form.costTaxRateId ?? ""}
                      options={[{ label: "Inherit", value: "" }, ...toOptions(taxRates.data)]}
                      onChange={(costTaxRateId) => set({ costTaxRateId })}
                      placeholder="Inherit"
                    />
                  </FormField>

                  <FormField
                    label="Prevent Manual Discounts"
                    help={
                      form.preventManualDiscounts
                        ? "Manual discounts cannot be applied to this product"
                        : "This product can have manual discounts applied"
                    }
                  >
                    <FormToggle
                      checked={form.preventManualDiscounts ?? false}
                      onChange={(preventManualDiscounts) => set({ preventManualDiscounts })}
                    />
                  </FormField>

                  <FormField
                    label="Cost Percentage"
                    help={
                      form.costPercentage
                        ? "This product's cost is a percentage of the sell price"
                        : "This product's cost won't be a percentage of the sell price"
                    }
                  >
                    <FormToggle
                      checked={form.costPercentage ?? false}
                      onChange={(costPercentage) => set({ costPercentage })}
                    />
                  </FormField>

                  <FormField label="Cost">
                    <div className="space-y-4">
                      <label className="flex cursor-pointer items-center gap-3">
                        <FormToggle
                          checked={showCostsIncludingTax}
                          onChange={setShowCostsIncludingTax}
                        />
                        <span className="text-[14px] text-[var(--oh-text)]">
                          Show Costs Including Tax
                        </span>
                      </label>
                      <div className="grid max-w-md grid-cols-2 gap-4">
                        <div>
                          <div className="mb-2 text-[13px] font-medium text-[var(--oh-text-secondary)]">
                            Case Cost
                          </div>
                          <MoneyInput
                            value={
                              form.cost != null && form.caseQuantity
                                ? Number((form.cost * form.caseQuantity).toFixed(2))
                                : form.cost
                            }
                            onChange={(caseCost) => {
                              if (caseCost == null) {
                                set({ cost: null });
                                return;
                              }
                              const caseQty = form.caseQuantity ?? 1;
                              set({ cost: caseQty > 0 ? caseCost / caseQty : caseCost });
                            }}
                          />
                        </div>
                        <div>
                          <div className="mb-2 text-[13px] font-medium text-[var(--oh-text-secondary)]">
                            Item Cost
                          </div>
                          <MoneyInput
                            value={form.cost}
                            onChange={(cost) => set({ cost })}
                          />
                        </div>
                      </div>
                    </div>
                  </FormField>

                  <FormField
                    label="Request Price"
                    help={
                      form.requestPrice
                        ? "Staff will be prompted to enter a price when adding this product to sales"
                        : "The prices of this product will be defined by the price table below"
                    }
                  >
                    <FormToggle
                      checked={form.requestPrice ?? false}
                      onChange={(requestPrice) => set({ requestPrice })}
                    />
                  </FormField>

                  <FormField
                    label="Request Quantity"
                    help={
                      form.requestQuantity
                        ? "Staff will be prompted to enter a quantity when adding this product to sales"
                        : "This product will add one unit when being added to sales"
                    }
                  >
                    <FormToggle
                      checked={form.requestQuantity ?? false}
                      onChange={(requestQuantity) => set({ requestQuantity })}
                    />
                  </FormField>

                  <div className="border-b border-[var(--oh-border)] py-5 last:border-b-0">
                    <div className="text-[14px] font-semibold text-[var(--oh-text)]">Prices</div>
                    {(form.familyMemberNames?.length ?? 0) > 0 && (
                      <p className="mt-2 text-[13px] leading-relaxed text-[var(--oh-muted)]">
                        Due to being in a family, modifying the prices here will also modify the
                        prices for:{" "}
                        {form.familyMemberNames!.slice(0, 3).join(", ")}
                        {form.familyMemberNames!.length > 3
                          ? `, and ${form.familyMemberNames!.length - 3} more`
                          : ""}
                        .
                      </p>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() =>
                          set({
                            prices: [
                              ...(form.prices ?? []),
                              { quantity: 1, price: null },
                            ],
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-[var(--oh-radius)] bg-[var(--oh-info)] px-3 py-2 text-[13px] font-medium text-white hover:opacity-90"
                      >
                        <PlusIcon size={16} />
                        New Price Point
                      </button>
                    </div>
                    {(form.prices?.length ?? 0) > 0 && (
                      <div className="mt-4 overflow-x-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)]">
                        <table aria-label="Product price breaks" className="min-w-full text-[13px]">
                          <thead>
                            <tr className="border-b border-[var(--oh-border)] bg-[var(--oh-surface)] text-left text-[var(--oh-muted)]">
                              <th scope="col" className="px-3 py-2 font-medium">Quantity</th>
                              <th scope="col" className="px-3 py-2 font-medium">Price</th>
                              <th scope="col" className="px-3 py-2 font-medium">Cost</th>
                              <th scope="col" className="px-3 py-2 font-medium">%</th>
                              <th scope="col" className="px-3 py-2 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {form.prices!.map((row, index) => {
                              const lineCost =
                                form.cost != null && row.quantity != null
                                  ? form.cost * row.quantity
                                  : null;
                              return (
                                <tr
                                  key={row.id ?? `new-${index}`}
                                  className="border-b border-[var(--oh-border)] last:border-b-0"
                                >
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={row.quantity ?? ""}
                                      onChange={(e) => {
                                        const quantity = parsePositiveQuantity(e.target.value);
                                        if (e.target.value !== "" && quantity == null) return;
                                        const prices = [...(form.prices ?? [])];
                                        prices[index] = {
                                          ...prices[index],
                                          quantity,
                                        };
                                        set({ prices });
                                      }}
                                      className={`${inputClass} max-w-[100px]`}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <MoneyInput
                                      className="max-w-[120px]"
                                      value={row.price}
                                      onChange={(price) => {
                                        const prices = [...(form.prices ?? [])];
                                        prices[index] = { ...prices[index], price };
                                        set({ prices });
                                      }}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-[var(--oh-text-secondary)]">
                                    {lineCost != null ? `$ ${lineCost.toFixed(2)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-[var(--oh-text-secondary)]">
                                    {marginPercent(row.price, form.cost, row.quantity) || "—"}
                                  </td>
                                  <td className="px-3 py-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        set({
                                          prices: (form.prices ?? []).filter((_, i) => i !== index),
                                        })
                                      }
                                      className="text-[var(--oh-danger)] hover:opacity-80"
                                      title="Delete price point"
                                    >
                                      <DeleteIcon size={18} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {tab === "inventory" && (
                <>
                  <div className="border-b border-[var(--oh-border)] py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                        <div className="text-[14px] font-semibold text-[var(--oh-text)]">
                          Track Inventory
                        </div>
                        <FormToggle
                          checked={form.trackInventory ?? true}
                          onChange={(trackInventory) => set({ trackInventory })}
                        />
                        <span className="text-[13px] text-[var(--oh-muted)]">
                          The inventory changes for this product will be tracked
                        </span>
                      </div>
                      <span className="shrink-0 text-[14px] text-[var(--oh-orange)]" title="Required">
                        ★
                      </span>
                    </div>
                  </div>

                  {inventoryLoading && (
                    <div role="status" aria-live="polite" className="py-8 text-center text-[13px] text-[var(--oh-muted)]">
                      Loading inventory…
                    </div>
                  )}
                  {inventoryError && (
                    <div className="flex flex-col items-center gap-3 py-8 text-center text-[13px] text-[var(--oh-danger)]">
                      <span>{inventoryError}</span>
                      <button type="button" onClick={reloadInventory} className="font-semibold underline">
                        Retry inventory
                      </button>
                    </div>
                  )}

                  {!inventoryLoading &&
                    !inventoryError &&
                    inventoryRows.map((row, outletIndex) => (
                      <div
                        key={String(row.outletId)}
                        className="border-b border-[var(--oh-border)] py-5 last:border-b-0"
                      >
                        <div className="mb-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <MapPinIcon
                              size={16}
                              className="text-[var(--oh-info)]"
                              strokeWidth={1.75}
                            />
                            <span className="text-[14px] font-semibold text-[var(--oh-text)]">
                              {row.outletName}
                            </span>
                          </div>
                          <span
                            className="shrink-0 text-[14px] text-[var(--oh-orange)]"
                            title="Required"
                          >
                            ★
                          </span>
                        </div>

                        <div className="max-w-2xl">
                          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3">
                            <div />
                            <div className="text-center text-[13px] font-medium text-[var(--oh-text-secondary)]">
                              Cases
                            </div>
                            <div className="text-center text-[13px] font-medium text-[var(--oh-text-secondary)]">
                              Items
                            </div>
                          </div>

                          {INVENTORY_ROWS.map(({ field, label }) => {
                            const total = row[field] as number | null | undefined;
                            const { cases, items } = splitCasesItems(total, form.caseQuantity);
                            const disabled = !(form.trackInventory ?? true);
                            return (
                              <div
                                key={field}
                                className="mb-3 grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3 last:mb-0"
                              >
                                <div className="text-[14px] text-[var(--oh-text)]">{label}</div>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  disabled={disabled}
                                  value={cases === 0 && total == null ? "" : cases}
                                  onChange={(e) =>
                                    updateInventoryField(
                                      outletIndex,
                                      field,
                                      "cases",
                                      e.target.value,
                                    )
                                  }
                                  className={cn(inputClass, "disabled:cursor-not-allowed disabled:opacity-60")}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  disabled={disabled}
                                  value={items === 0 && total == null ? "" : items}
                                  onChange={(e) =>
                                    updateInventoryField(
                                      outletIndex,
                                      field,
                                      "items",
                                      e.target.value,
                                    )
                                  }
                                  className={cn(inputClass, "disabled:cursor-not-allowed disabled:opacity-60")}
                                />
                              </div>
                            );
                          })}

                          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_248px] items-center gap-3">
                            <div className="text-[14px] text-[var(--oh-text)]">Reorder Rounding</div>
                            <FormSelect
                              value={row.reorderRounding ?? "NONE"}
                              options={REORDER_ROUNDING_OPTIONS}
                              onChange={(reorderRounding) =>
                                updateInventoryRounding(outletIndex, reorderRounding)
                              }
                              disabled={!(form.trackInventory ?? true)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                  {!inventoryLoading && !inventoryError && inventoryRows.length === 0 && (
                    <div className="py-8 text-center text-[13px] text-[var(--oh-muted)]">
                      No outlets configured.
                    </div>
                  )}
                </>
              )}

              {tab === "barcodes" && (
                <>
                  {(form.barcodes?.length ?? 0) > 0 && (
                    <FormField label="Associated Barcodes" help="Barcodes linked to this product">
                      <ul className="divide-y divide-[var(--oh-border)] rounded-[var(--oh-radius)] border border-[var(--oh-border)]">
                        {form.barcodes!.map((row) => (
                          <li
                            key={String(row.id)}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-[14px]"
                          >
                            <span className="font-mono text-[var(--oh-text)]">{row.code}</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeBarcode(row.id)}
                              className="text-[13px] text-[var(--oh-danger)] hover:underline disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </FormField>
                  )}
                  <FormField
                    label="Add Barcode"
                    help="Associate a barcode with this product for scanning at the register"
                  >
                    <div className="flex max-w-md gap-2">
                      <input
                        value={barcode}
                        onChange={(e) => {
                          setBarcode(e.target.value);
                          if (saveError) setSaveError(null);
                        }}
                        placeholder="Scan or enter barcode"
                        aria-invalid={!!barcodeError}
                        className={`${inputClass}${
                          barcodeError
                            ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                            : ""
                        }`}
                      />
                    </div>
                    <p className="mt-2 text-[13px] text-[var(--oh-muted)]">{BARCODE_FORMAT_HINT}</p>
                    {barcodeChecking && barcode.trim() && !barcodeError && (
                      <p className="mt-2 text-[13px] text-[var(--oh-muted)]">Checking barcode…</p>
                    )}
                    {barcodeError && (
                      <p className="mt-2 text-[13px] text-[var(--oh-danger)]">{barcodeError}</p>
                    )}
                    <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
                      New barcodes are saved when you click Save Changes.
                    </p>
                  </FormField>
                </>
              )}

              {tab === "suppliers" && (
                <FormField label="Suppliers" help="Suppliers that provide this product">
                  <FormSelect
                    value={supplierId}
                    options={toOptions(suppliers.data?.items)}
                    onChange={setSupplierId}
                    placeholder="Select a supplier…"
                  />
                </FormField>
              )}

              {tab === "images" && (
                <FormField label="Product Image" help="URL or path to the product image">
                  <input
                    value={form.image ?? ""}
                    onChange={(e) => set({ image: e.target.value })}
                    placeholder="Image URL"
                    className={inputClass}
                  />
                  {form.image && (
                    <div className="mt-3 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.image} alt={form.name} className="max-h-full max-w-full object-contain" />
                    </div>
                  )}
                </FormField>
              )}

              {tab === "loyalty" && (
                <FormField
                  label="Loyalty Points"
                  help="Configure how many loyalty points customers earn when purchasing this product"
                >
                  <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-[14px] text-[var(--oh-muted)]">
                    Loyalty settings are configured in Settings → Loyalty.
                  </div>
                </FormField>
              )}

              {/* Footer actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-4">
                <div className="text-[13px]">
                  {saveError && <span className="text-[var(--oh-danger)]">{saveError}</span>}
                  {saveOk && !saveError && (
                    <span className="text-[var(--oh-success)]">Changes saved successfully.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <AdminSecondaryButton onClick={leavePage}>
                    Cancel
                  </AdminSecondaryButton>
                  <AdminPrimaryButton onClick={save} disabled={busy || barcodeBlocksSave}>
                    {busy ? "Saving…" : "Save Changes"}
                  </AdminPrimaryButton>
                </div>
              </div>
            </div>
          )}
        </AsyncState>
      </div>
    </div>
  );
}
