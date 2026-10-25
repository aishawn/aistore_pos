"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { BARCODE_FORMAT_HINT, generateInStoreEan13, validateBarcode } from "@/lib/barcode";
import { validatePositiveMoney, validatePositiveQuantity } from "@/lib/quantity";
import { uniqueSelectOptions } from "@/components/admin/FilterSelect";
import {
  BarcodeIcon,
  ChevronDownIcon,
  DollarIcon,
  PackageIcon,
  SaveIcon,
  TagIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  consumeAiCreatePrefill,
  type ProductCreatePrefill,
} from "@/lib/ai-create-prefill";

interface Named {
  id: string | number;
  name: string;
}

type SectionId = "general" | "classifications" | "pricing";

interface ProductForm {
  barcode: string;
  name: string;
  categoryId: string;
  familyId: string;
  tagId: string;
  caseQuantity: string;
  priceQuantity: string;
  price: string;
}

const EMPTY_FORM: ProductForm = {
  barcode: "",
  name: "",
  categoryId: "",
  familyId: "",
  tagId: "",
  caseQuantity: "1",
  priceQuantity: "1",
  price: "0",
};

const SECTIONS: { id: SectionId; label: string; Icon: typeof PackageIcon }[] = [
  { id: "general", label: "General", Icon: PackageIcon },
  { id: "classifications", label: "Classifications", Icon: TagIcon },
  { id: "pricing", label: "Sell & Cost", Icon: DollarIcon },
];

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

function RequiredMark() {
  return <span className="ml-0.5 text-[var(--oh-danger)]">*</span>;
}

function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
      {children}
      {required && <RequiredMark />}
    </span>
  );
}

function FormSection({
  id,
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  sectionRef,
}: {
  id: SectionId;
  title: string;
  icon: typeof PackageIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={`section-${id}`}
      ref={sectionRef}
      className="relative scroll-mt-4 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-sm has-[[data-select-open=true]]:z-30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-[var(--oh-border)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--oh-surface)]"
      >
        <Icon size={18} className="shrink-0 text-[var(--oh-text-secondary)]" strokeWidth={1.75} />
        <span className="flex-1 text-[15px] font-semibold text-[var(--oh-text)]">{title}</span>
        <ChevronDownIcon
          size={18}
          className={cn("text-[var(--oh-muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="space-y-3 px-4 py-4">{children}</div>}
    </div>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uniqueOptions = uniqueSelectOptions(options);
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
    <label className="block">
      <FormLabel required={required}>{label}</FormLabel>
      <div ref={wrapRef} className="relative" data-select-open={open}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDownIcon
            size={16}
            className={cn("text-[var(--oh-muted)] transition-transform", open && "rotate-180")}
          />
        </button>
        {open && !disabled && (
          <ul className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-1 shadow-[var(--oh-shadow-card)]">
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
                      String(o.value) === String(value)
                        ? "bg-[var(--oh-orange-light)]/40 font-medium text-[var(--oh-text)]"
                        : "text-[var(--oh-text)]"
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
    </label>
  );
}

function validateProductName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Product name is required.";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return "Product name cannot be only numbers.";
  return null;
}

function productFormSnapshot(form: ProductForm): string {
  return JSON.stringify(form);
}

function mergeProductAiPrefill(base: ProductForm): ProductForm {
  if (typeof window === "undefined") {
    return { ...base, barcode: base.barcode || generateInStoreEan13() };
  }
  const prefill = consumeAiCreatePrefill<Partial<ProductCreatePrefill>>("product");
  if (!prefill) {
    return { ...base, barcode: base.barcode || generateInStoreEan13() };
  }
  return {
    ...base,
    ...prefill,
    barcode: prefill.barcode?.trim() || generateInStoreEan13(),
    name: prefill.name?.trim() || base.name,
    caseQuantity: prefill.caseQuantity?.trim() || base.caseQuantity,
    priceQuantity: prefill.priceQuantity?.trim() || base.priceQuantity,
    price: prefill.price?.trim() ?? base.price,
  };
}

function namedOptions(rows?: Named[] | null): { label: string; value: string }[] {
  return (rows ?? [])
    .filter((r) => r.id != null && String(r.id).trim() !== "" && r.name?.trim())
    .map((r) => ({ label: r.name.trim(), value: String(r.id) }));
}

function firstNamedId(rows?: Named[] | null): string {
  const first = (rows ?? []).find((r) => r.id != null && String(r.id).trim() !== "");
  return first ? String(first.id) : "";
}

/** Full-page product create form. AI prefills required fields; user clicks Save. */
export function CreateProductPage() {
  const router = useRouter();
  const { setDirty, confirmNavigation, registerDirtyChecker } = useUnsavedChanges();
  const [form, setForm] = useState<ProductForm>(() => mergeProductAiPrefill(EMPTY_FORM));
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const createBaselineRef = useRef<string | null>(null);
  if (createBaselineRef.current === null) {
    createBaselineRef.current = productFormSnapshot(form);
  }

  const categoriesQuery = useApi<Named[]>("/api/classifications/category");
  const familiesQuery = useApi<Named[]>("/api/classifications/family");
  const tagsQuery = useApi<Named[]>("/api/classifications/tag");

  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    general: null,
    classifications: null,
    pricing: null,
  });

  useEffect(() => {
    if (categoriesQuery.loading && tagsQuery.loading) return;
    setForm((prev) => {
      const nextCategory = prev.categoryId || firstNamedId(categoriesQuery.data);
      const nextTag = prev.tagId || firstNamedId(tagsQuery.data);
      const nextFamily = prev.familyId || firstNamedId(familiesQuery.data);
      if (
        nextCategory === prev.categoryId &&
        nextTag === prev.tagId &&
        nextFamily === prev.familyId
      ) {
        return prev;
      }
      const next = {
        ...prev,
        categoryId: nextCategory,
        tagId: nextTag,
        familyId: nextFamily,
      };
      if (createBaselineRef.current === productFormSnapshot(prev)) {
        createBaselineRef.current = productFormSnapshot(next);
      }
      return next;
    });
  }, [
    categoriesQuery.loading,
    categoriesQuery.data,
    tagsQuery.loading,
    tagsQuery.data,
    familiesQuery.data,
  ]);

  const checkDirty = useCallback(() => {
    if (!createBaselineRef.current) return false;
    return productFormSnapshot(form) !== createBaselineRef.current;
  }, [form]);

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

  useDialogFocus(true, leavePage, "create-product-page", nameInputRef);

  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError(null);
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save() {
    const nameError = validateProductName(form.name);
    if (nameError) {
      setError(nameError);
      scrollToSection("general");
      return;
    }

    const barcodeError = validateBarcode(form.barcode, { required: true });
    if (barcodeError) {
      setError(barcodeError);
      scrollToSection("general");
      return;
    }

    if (!form.categoryId) {
      setError("Category is required.");
      scrollToSection("classifications");
      return;
    }

    if (!form.tagId) {
      setError("Tag is required.");
      scrollToSection("classifications");
      return;
    }

    const caseQtyError = validatePositiveQuantity(form.caseQuantity, "Case quantity");
    if (caseQtyError) {
      setError(caseQtyError);
      scrollToSection("pricing");
      return;
    }

    const priceQtyError = validatePositiveQuantity(form.priceQuantity, "Price quantity");
    if (priceQtyError) {
      setError(priceQtyError);
      scrollToSection("pricing");
      return;
    }

    if (!form.price.trim()) {
      setError("Price is required.");
      scrollToSection("pricing");
      return;
    }
    const priceError = validatePositiveMoney(form.price, "Price");
    if (priceError) {
      setError(priceError);
      scrollToSection("pricing");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        caseQuantity: Number(form.caseQuantity),
      };
      if (form.familyId) body.familyId = form.familyId;

      const product = await api.post<{ id: string }>("/api/products", body);
      await api.post(`/api/products/${product.id}/barcodes`, { barcode: form.barcode.trim() });
      await api.post(`/api/products/${product.id}/tags`, { tagId: form.tagId });
      await api.post(`/api/products/${product.id}/prices`, {
        quantity: Number(form.priceQuantity),
        price: Number(form.price),
      });

      createBaselineRef.current = productFormSnapshot(form);
      setDirty(false);
      router.push("/products");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create product";
      setError(message);
      if (e instanceof ApiError && e.code === 40903) {
        scrollToSection("general");
      }
    } finally {
      setBusy(false);
    }
  }

  const displayName = form.name.trim() || "Create Product";
  const categoryOptions = namedOptions(categoriesQuery.data);
  const familyOptions = namedOptions(familiesQuery.data);
  const tagOptions = namedOptions(tagsQuery.data);

  return (
    <div className="absolute inset-0 z-50 flex items-stretch justify-center bg-[var(--oh-scrim)] p-4 font-sans md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex min-h-0 w-full max-w-[1100px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-[var(--oh-surface-elevated)] shadow-2xl"
      >
        <div className="relative shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-6 py-4">
          <h1 id={titleId} className="text-center text-[18px] font-semibold text-[var(--oh-muted)] md:text-[20px]">
            {displayName}
          </h1>
          <button
            type="button"
            onClick={leavePage}
            className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-[var(--oh-border)] bg-[var(--oh-surface-muted)] md:block">
            <ul className="py-2">
              {SECTIONS.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium transition-colors",
                      activeSection === id
                        ? "bg-[var(--oh-orange-light)] text-[var(--oh-text)]"
                        : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-elevated)] hover:text-[var(--oh-text)]",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--oh-surface)] px-4 py-5 pb-24 md:px-6 md:pb-24">
            <div className="mx-auto max-w-xl space-y-4">
              <FormSection
                id="general"
                title="General Information"
                icon={PackageIcon}
                sectionRef={(el) => {
                  sectionRefs.current.general = el;
                }}
              >
                <label className="block">
                  <FormLabel required>Name</FormLabel>
                  <input
                    ref={nameInputRef}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Product name"
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FormLabel required>Barcode</FormLabel>
                  <div className="relative">
                    <BarcodeIcon
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]"
                    />
                    <input
                      value={form.barcode}
                      onChange={(e) => set("barcode", e.target.value)}
                      placeholder="Scan or enter barcode"
                      className={cn(inputClass, "pl-9")}
                    />
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--oh-muted)]">{BARCODE_FORMAT_HINT}</p>
                </label>
              </FormSection>

              <FormSection
                id="classifications"
                title="Classifications"
                icon={TagIcon}
                sectionRef={(el) => {
                  sectionRefs.current.classifications = el;
                }}
              >
                <FormSelect
                  label="Category"
                  required
                  value={form.categoryId}
                  options={categoryOptions}
                  onChange={(v) => set("categoryId", v)}
                  disabled={categoriesQuery.loading}
                  placeholder={categoriesQuery.loading ? "Loading…" : "Select category"}
                />
                <FormSelect
                  label="Family"
                  value={form.familyId}
                  options={familyOptions}
                  onChange={(v) => set("familyId", v)}
                  disabled={familiesQuery.loading}
                  placeholder={familiesQuery.loading ? "Loading…" : "Select family (optional)"}
                />
                <FormSelect
                  label="Tag"
                  required
                  value={form.tagId}
                  options={tagOptions}
                  onChange={(v) => set("tagId", v)}
                  disabled={tagsQuery.loading}
                  placeholder={tagsQuery.loading ? "Loading…" : "Select tag"}
                />
              </FormSection>

              {(categoriesQuery.error || familiesQuery.error || tagsQuery.error) && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--brand-warning)] bg-[var(--brand-warning-tint)] px-3 py-2.5 text-[13px] text-[var(--brand-warning)]">
                  <span>Some classifications could not be loaded. Your form is preserved.</span>
                  <button
                    type="button"
                    onClick={() => {
                      categoriesQuery.reload();
                      familiesQuery.reload();
                      tagsQuery.reload();
                    }}
                    className="min-h-11 rounded-md border border-[var(--brand-warning)] bg-[var(--oh-surface-elevated)] px-3 font-semibold text-[var(--oh-text)] hover:bg-[var(--brand-warning-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-warning)]"
                  >
                    Retry
                  </button>
                </div>
              )}

              <FormSection
                id="pricing"
                title="Sell & Cost"
                icon={DollarIcon}
                sectionRef={(el) => {
                  sectionRefs.current.pricing = el;
                }}
              >
                <label className="block">
                  <FormLabel required>Case quantity</FormLabel>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.caseQuantity}
                    onChange={(e) => set("caseQuantity", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <FormLabel required>Price quantity</FormLabel>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.priceQuantity}
                      onChange={(e) => set("priceQuantity", e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <FormLabel required>Price</FormLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(e) => set("price", e.target.value)}
                        className={cn(inputClass, "pl-7")}
                      />
                    </div>
                  </label>
                </div>
              </FormSection>

              {error && <p className="text-[14px] text-[var(--brand-danger)]">{error}</p>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3 md:pointer-events-none md:absolute md:bottom-8 md:right-8 md:border-0 md:bg-transparent md:p-0">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="pointer-events-auto flex items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--brand-info)] px-5 py-3 text-[15px] font-semibold text-[var(--brand-on-info)] shadow-lg transition-colors hover:brightness-95 disabled:opacity-60"
          >
            <SaveIcon size={18} />
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
