"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { BARCODE_FORMAT_HINT, validateBarcode } from "@/lib/barcode";
import { validatePositiveMoney, validatePositiveQuantity } from "@/lib/quantity";
import { isLiquorProduct } from "@/lib/au";
import { useApi } from "@/hooks/useApi";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { uniqueSelectOptions } from "@/components/admin/FilterSelect";
import {
  XIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  SelectChevronIcon,
} from "@/components/icons";

interface Named {
  id: string;
  name: string;
}

export interface CreateProductData {
  barcode: string;
  name: string;
  categoryId: string;
  familyId: string;
  tagId: string;
  caseQuantity: string;
  priceQuantity: string;
  price: string;
  abv: string;
  volumeMl: string;
  region: string;
  vintage: string;
}

const STEPS = 7;
const EMPTY: CreateProductData = {
  barcode: "",
  name: "",
  categoryId: "",
  familyId: "",
  tagId: "",
  caseQuantity: "",
  priceQuantity: "1",
  price: "",
  abv: "",
  volumeMl: "",
  region: "",
  vintage: "",
};

function validateProductName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Product name is required.";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return "Product name cannot be only numbers.";
  return null;
}

function validateCaseQuantity(value: string): string | null {
  return validatePositiveQuantity(value, "Case quantity");
}

function validatePriceQuantity(value: string): string | null {
  return validatePositiveQuantity(value, "Price quantity");
}

function validatePrice(value: string): string | null {
  if (!value.trim()) return "Price is required.";
  return validatePositiveMoney(value, "Price");
}

const REQUIRED_EMPTY_MESSAGE = "必填项不能为空";

const inputClass =
  "mt-4 h-12 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 text-[15px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

const selectWrapClass = "relative mt-4";
const selectTriggerClass =
  "flex h-12 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 text-[15px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length: STEPS }, (_, i) => (
        <span
          key={i}
          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
            i === step ? "border-[var(--oh-orange)]" : "border-[var(--oh-border)]"
          }`}
        >
          {i === step && <span className="h-2 w-2 rounded-full bg-[var(--oh-primary)]" />}
        </span>
      ))}
    </div>
  );
}

function StepSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  invalid = false,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
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
    <div ref={wrapRef} className={selectWrapClass}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${selectTriggerClass} disabled:cursor-not-allowed disabled:opacity-60${
          invalid
            ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
            : ""
        }`}
      >
        <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
          {selected?.label ?? placeholder}
        </span>
        <SelectChevronIcon
          size={18}
          className={`text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && !disabled && (
        <ul className="absolute z-[200] mt-1 max-h-56 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
          {uniqueOptions.length === 0 ? (
            <li className="px-4 py-3 text-[14px] text-[var(--oh-muted)]">No options available</li>
          ) : (
            uniqueOptions.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full px-4 py-3 text-left text-[15px] hover:bg-[var(--oh-surface)] ${
                    String(o.value) === String(value) ? "bg-[var(--oh-orange-light)]/40 font-medium text-[var(--oh-text)]" : "text-[var(--oh-text)]"
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

/**
 * Seven-step product creation wizard. Functional flow mirrors Shopfront's Create
 * Product flow; styling matches AdminPageLayout (--oh-* design tokens).
 */
export function CreateProductWizard({
  open,
  onClose,
  onCreated,
  categories: categoriesProp,
  families: familiesProp,
  tags: tagsProp,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories?: Named[];
  families?: Named[];
  tags?: Named[];
  initial?: Partial<CreateProductData> | null;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateProductData>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const next = { ...EMPTY, ...initial };
      setForm(next);
      // Jump to last step when AI prefilled required fields so user only clicks Finish.
      const ready =
        !validateBarcode(next.barcode, { required: true }) &&
        !!next.name.trim() &&
        !!next.categoryId &&
        !!next.tagId &&
        !!next.caseQuantity.trim() &&
        !!next.priceQuantity.trim() &&
        next.price.trim() !== "";
      setStep(ready ? STEPS - 1 : 0);
    } else {
      setForm(EMPTY);
      setStep(0);
    }
    setError(null);
  }, [open, initial]);

  const categoriesQuery = useApi<Named[]>(open && !categoriesProp ? "/api/classifications/category" : null);
  const {
    data: familiesData,
    loading: familiesLoading,
    error: familiesError,
    reload: reloadFamilies,
  } = useApi<Named[]>(open && !familiesProp ? "/api/classifications/family" : null);
  const { data: tagsData, loading: tagsLoading, error: tagsError, reload: reloadTags } = useApi<Named[]>(
    open && !tagsProp ? "/api/classifications/tag" : null,
  );

  const categories = categoriesProp ?? categoriesQuery.data ?? [];
  const families = familiesProp ?? familiesData ?? [];
  const tags = tagsProp ?? tagsData ?? [];

  useEffect(() => {
    if (open && step === 3 && !familiesProp) reloadFamilies();
  }, [open, step, familiesProp, reloadFamilies]);

  useEffect(() => {
    if (open && step === 4 && !tagsProp) reloadTags();
  }, [open, step, tagsProp, reloadTags]);

  if (!open) return null;

  const set = (patch: Partial<CreateProductData>) => setForm((f) => ({ ...f, ...patch }));
  const productLabel = form.name.trim() || "this product";
  const categoryOptions = categories.map((c) => ({ label: c.name, value: String(c.id) }));
  const familyOptions = families.map((f) => ({ label: f.name, value: String(f.id) }));
  const tagOptions = tags.map((t) => ({ label: t.name, value: String(t.id) }));
  const finishDisabled =
    busy || !!validatePriceQuantity(form.priceQuantity) || !!validatePrice(form.price);

  function resetAndClose() {
    setStep(0);
    setForm(EMPTY);
    setError(null);
    onClose();
  }

  function onWizardKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || busy || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "TEXTAREA") return;
    e.preventDefault();
    if (step < STEPS - 1) goNext();
    else void finish();
  }

  function goNext() {
    if (step === 0) {
      if (!form.barcode.trim()) {
        setError(REQUIRED_EMPTY_MESSAGE);
        return;
      }
      const barcodeError = validateBarcode(form.barcode, { required: true });
      if (barcodeError) {
        setError(barcodeError);
        return;
      }
    }
    if (step === 1) {
      const nameError = validateProductName(form.name);
      if (nameError) {
        setError(nameError);
        return;
      }
    }
    if (step === 2 && !form.categoryId) {
      setError("Category is required.");
      return;
    }
    if (step === 4 && !form.tagId) {
      setError("Tag is required.");
      return;
    }
    if (step === 5) {
      const caseQtyError = validateCaseQuantity(form.caseQuantity);
      if (caseQtyError) {
        setError(caseQtyError);
        return;
      }
    }
    setError(null);
    if (step < STEPS - 1) setStep((s) => s + 1);
  }

  function goPrev() {
    setError(null);
    if (step > 0) setStep((s) => s - 1);
  }

  async function finish() {
    if (!form.barcode.trim()) {
      setError(REQUIRED_EMPTY_MESSAGE);
      setStep(0);
      return;
    }
    const barcodeError = validateBarcode(form.barcode, { required: true });
    if (barcodeError) {
      setError(barcodeError);
      setStep(0);
      return;
    }

    const nameError = validateProductName(form.name);
    if (nameError) {
      setError(nameError);
      setStep(1);
      return;
    }

    if (!form.categoryId) {
      setError("Category is required.");
      setStep(2);
      return;
    }

    if (!form.tagId) {
      setError("Tag is required.");
      setStep(4);
      return;
    }

    const caseQtyError = validateCaseQuantity(form.caseQuantity);
    if (caseQtyError) {
      setError(caseQtyError);
      setStep(5);
      return;
    }

    const priceQtyError = validatePriceQuantity(form.priceQuantity);
    if (priceQtyError) {
      setError(priceQtyError);
      setStep(6);
      return;
    }

    const priceError = validatePrice(form.price);
    if (priceError) {
      setError(priceError);
      setStep(6);
      return;
    }

    const categoryName = categories.find((c) => String(c.id) === String(form.categoryId))?.name;
    if (isLiquorProduct(form.name, categoryName)) {
      const abv = Number(form.abv);
      if (!form.abv.trim() || Number.isNaN(abv) || abv < 0 || abv > 100) {
        setError("Alcohol by volume (ABV %) is required for liquor products.");
        setStep(6);
        return;
      }
    }
    if (form.volumeMl.trim()) {
      const volume = Number(form.volumeMl);
      if (!Number.isInteger(volume) || volume < 1 || volume > 20000) {
        setError("Volume must be between 1 and 20000 ml.");
        setStep(6);
        return;
      }
    }
    if (form.vintage.trim() && !/^(?:NV|\d{4})$/i.test(form.vintage.trim())) {
      setError("Vintage must be a four-digit year or NV.");
      setStep(6);
      return;
    }

    const name = form.name.trim();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        categoryId: form.categoryId,
        caseQuantity: Number(form.caseQuantity),
      };
      if (form.familyId) body.familyId = form.familyId;
      if (form.abv.trim()) body.abv = Number(form.abv);
      if (form.volumeMl.trim()) body.volumeMl = Number(form.volumeMl);
      if (form.region.trim()) body.region = form.region.trim();
      if (form.vintage.trim()) body.vintage = form.vintage.trim().toUpperCase();

      const product = await api.post<{ id: string }>("/api/products", body);

      await api.post(`/api/products/${product.id}/barcodes`, { barcode: form.barcode.trim() });
      await api.post(`/api/products/${product.id}/tags`, { tagId: form.tagId });
      await api.post(`/api/products/${product.id}/prices`, {
        quantity: Number(form.priceQuantity),
        price: Number(form.price),
      });

      resetAndClose();
      onCreated();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create product";
      setError(message);
      if (
        e instanceof ApiError &&
        (e.code === 40902 || message.toLowerCase().includes("already exists"))
      ) {
        setStep(e.code === 40903 ? 0 : 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6 font-sans">
      <div
        className="flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onWizardKeyDown}
      >
        {/* Header */}
        <div className="relative border-b border-[var(--oh-border)] px-8 pb-5 pt-8">
          <button
            type="button"
            onClick={resetAndClose}
            className="absolute right-6 top-6 flex items-center gap-2 text-[14px] font-medium text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
          >
            <XIcon size={18} />
            Cancel
          </button>
          <ProgressDots step={step} />
          <h2 className="mt-5 text-center text-[22px] font-semibold text-[var(--oh-text)]">Create Product</h2>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-visible px-8 py-10">
          {step === 0 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What is the barcode for the product?
              </p>
              <input
                autoFocus
                required
                value={form.barcode}
                onChange={(e) => {
                  set({ barcode: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="Scan or enter barcode"
                aria-required="true"
                aria-invalid={!!error && step === 0}
                className={`${inputClass}${
                  error && step === 0
                    ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                    : ""
                }`}
              />
              <p className="mt-3 text-[13px] text-[var(--oh-muted)]">{BARCODE_FORMAT_HINT}</p>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What is the name of this product?
              </p>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => {
                  set({ name: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="Product name"
                aria-invalid={!!error}
                className={`${inputClass}${
                  error ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]" : ""
                }`}
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What category does it belong to?
              </p>
              <StepSelect
                value={form.categoryId}
                options={categoryOptions}
                onChange={(categoryId) => {
                  set({ categoryId });
                  if (error) setError(null);
                }}
                invalid={!!error && step === 2}
              />
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What family does it belong to?
              </p>
              <StepSelect
                value={form.familyId}
                options={familyOptions}
                onChange={(familyId) => {
                  set({ familyId });
                  if (error) setError(null);
                }}
                disabled={familiesLoading}
                placeholder={familiesLoading ? "Loading families…" : "Select..."}
              />
              {familiesError && (
                <p className="mt-3 text-[14px] text-[var(--oh-danger)]">
                  Failed to load families: {familiesError}
                </p>
              )}
              {!familiesLoading && !familiesError && familyOptions.length === 0 && (
                <p className="mt-3 text-[14px] text-[var(--oh-muted)]">
                  No families yet. Add families under Classifications first.
                </p>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">What tags does it have?</p>
              <StepSelect
                value={form.tagId}
                options={tagOptions}
                onChange={(tagId) => {
                  set({ tagId });
                  if (error) setError(null);
                }}
                disabled={tagsLoading}
                placeholder={tagsLoading ? "Loading tags…" : "Select..."}
                invalid={!!error && step === 4}
              />
              {tagsError && (
                <p className="mt-3 text-[14px] text-[var(--oh-danger)]">Failed to load tags: {tagsError}</p>
              )}
              {!tagsLoading && !tagsError && tagOptions.length === 0 && (
                <p className="mt-3 text-[14px] text-[var(--oh-muted)]">
                  No tags yet. Add tags under Classifications first.
                </p>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                How many {productLabel}&apos;s come in a case?
              </p>
              <input
                autoFocus
                type="number"
                min="1"
                step="1"
                value={form.caseQuantity}
                onChange={(e) => {
                  set({ caseQuantity: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="Case quantity"
                aria-invalid={!!error && step === 5}
                className={`${inputClass}${
                  error && step === 5
                    ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                    : ""
                }`}
              />
            </>
          )}

          {step === 6 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What prices does {productLabel} have?
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.priceQuantity}
                    onChange={(e) => {
                      set({ priceQuantity: e.target.value });
                      if (error) setError(null);
                    }}
                    aria-invalid={!!error && step === 6}
                    className={`${inputClass.replace("mt-4", "mt-1")}${
                      error && step === 6
                        ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                        : ""
                    }`}
                  />
                </label>
                <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                  Price
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => {
                        set({ price: e.target.value });
                        if (error) setError(null);
                      }}
                      aria-invalid={!!error && step === 6}
                      className={`${inputClass.replace("mt-4", "").replace("px-4", "pr-4")} pl-7${
                        error && step === 6
                          ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                          : ""
                      }`}
                    />
                  </div>
                </label>
              </div>
              {isLiquorProduct(
                form.name,
                categories.find((c) => String(c.id) === String(form.categoryId))?.name,
              ) && (
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                    ABV %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.abv}
                      onChange={(e) => {
                        set({ abv: e.target.value });
                        if (error) setError(null);
                      }}
                      placeholder="Required, e.g. 4.6"
                      className={inputClass.replace("mt-4", "mt-1")}
                    />
                  </label>
                  <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                    Volume (ml)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.volumeMl}
                      onChange={(e) => {
                        set({ volumeMl: e.target.value });
                        if (error) setError(null);
                      }}
                      placeholder="e.g. 375"
                      className={inputClass.replace("mt-4", "mt-1")}
                    />
                  </label>
                  <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                    Region
                    <input
                      type="text"
                      maxLength={128}
                      value={form.region}
                      onChange={(e) => {
                        set({ region: e.target.value });
                        if (error) setError(null);
                      }}
                      placeholder="e.g. Barossa Valley"
                      className={inputClass.replace("mt-4", "mt-1")}
                    />
                  </label>
                  <label className="text-[14px] font-medium text-[var(--oh-text-secondary)]">
                    Vintage
                    <input
                      type="text"
                      maxLength={16}
                      value={form.vintage}
                      onChange={(e) => {
                        set({ vintage: e.target.value });
                        if (error) setError(null);
                      }}
                      placeholder="2021 or NV"
                      className={inputClass.replace("mt-4", "mt-1")}
                    />
                  </label>
                </div>
              )}
              <p className="mt-4 text-[13px] text-[var(--oh-muted)]">
                You can customise the prices further on the product details page.
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="mt-6 text-[14px] font-medium text-[var(--oh-danger)]">
              {error}
            </p>
          )}
        </div>

        {/* Footer navigation */}
        <div className="grid grid-cols-2 items-center border-t border-[var(--oh-border)] px-8 py-5">
          <div>
            {step > 0 && (
              <button
                type="button"
                onClick={goPrev}
                disabled={busy}
                className="flex items-center gap-2 text-[14px] font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)] disabled:opacity-50"
              >
                <ArrowLeftIcon size={18} />
                Previous
              </button>
            )}
          </div>
          <div className="flex justify-end">
            {step < STEPS - 1 ? (
              <AdminPrimaryButton onClick={goNext} disabled={busy}>
                Next
                <ChevronRightIcon size={18} />
              </AdminPrimaryButton>
            ) : (
              <AdminPrimaryButton onClick={finish} disabled={finishDisabled}>
                <CircleCheckIcon size={18} />
                {busy ? "Creating…" : "Finish"}
              </AdminPrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
