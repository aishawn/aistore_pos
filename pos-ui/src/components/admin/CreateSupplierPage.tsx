"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import { AdminActionFooter } from "@/components/admin/AdminPageLayout";
import {
  BookOpenIcon,
  CalculatorIcon,
  CartIcon,
  ChevronDownIcon,
  ClipboardIcon,
  InfoIcon,
  LockIcon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { consumeAiCreatePrefill } from "@/lib/ai-create-prefill";

interface MdbReference {
  id: number;
  name: string;
}

interface AdditionalContact {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface SupplierDetail {
  id?: string | number;
  name?: string;
  status?: string;
  mdbId?: number | null;
  businessNumber?: string;
  accountNumber?: string;
  email?: string;
  fax?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  twitter?: string;
  facebook?: string;
  streetAddress1?: string;
  streetAddress2?: string;
  suburb?: string;
  city?: string;
  postCode?: string;
  region?: string;
  country?: string;
  orderNotes?: string;
  internalOrderNotes?: string;
  orderAutomaticEmail?: boolean;
  emailFormat?: string;
  allowOrderBelowMinimum?: boolean;
  minimumOrderValue?: number | null;
  maximumOrderValue?: number | null;
  defaultDaysUntilDue?: number | null;
  feeAmount?: number | null;
  distributeFees?: string;
  distributeFreight?: string;
  defaultOrderTax?: string;
  freightTaxId?: number | null;
  feesTaxId?: number | null;
  freightIncludedOnInvoices?: boolean;
  freightFixedCostPerCase?: number | null;
  comments?: string;
  authAccountNumber?: string;
  username?: string;
  additionalAuth?: string;
  additionalContacts?: AdditionalContact[];
}

interface SupplierForm {
  name: string;
  status: string;
  businessNumber: string;
  accountNumber: string;
  mdbId: string;
  email: string;
  fax: string;
  phone: string;
  mobile: string;
  website: string;
  twitter: string;
  facebook: string;
  streetAddress1: string;
  streetAddress2: string;
  suburb: string;
  city: string;
  postCode: string;
  region: string;
  country: string;
  authAccountNumber: string;
  username: string;
  password: string;
  additionalAuth: string;
  orderNotes: string;
  internalOrderNotes: string;
  emailOrderAutomatically: boolean;
  emailFormat: string;
  allowOrdersBelowMinimum: boolean;
  minimumOrderValue: string;
  maximumOrderValue: string;
  defaultDaysUntilDue: string;
  paymentFeePercentage: string;
  distributeFees: string;
  distributeFreightAcross: string;
  defaultOrderTax: string;
  freightTax: string;
  feesTax: string;
  freightIncludedByDefault: boolean;
  fixedFreightCostPerCase: string;
  comments: string;
}

type SectionId =
  | "general"
  | "contact"
  | "address"
  | "additional-contacts"
  | "authentication"
  | "ordering"
  | "receiving"
  | "miscellaneous";

const SECTIONS: { id: SectionId; label: string; Icon: typeof InfoIcon }[] = [
  { id: "general", label: "General Information", Icon: InfoIcon },
  { id: "contact", label: "Contact", Icon: CalculatorIcon },
  { id: "address", label: "Address", Icon: BookOpenIcon },
  { id: "additional-contacts", label: "Additional Contacts", Icon: UsersIcon },
  { id: "authentication", label: "Authentication", Icon: LockIcon },
  { id: "ordering", label: "Ordering", Icon: ClipboardIcon },
  { id: "receiving", label: "Receiving Orders", Icon: CartIcon },
  { id: "miscellaneous", label: "Miscellaneous", Icon: PackageIcon },
];

const EMPTY_FORM: SupplierForm = {
  name: "",
  status: "ACTIVE",
  businessNumber: "",
  accountNumber: "",
  mdbId: "",
  email: "",
  fax: "",
  phone: "",
  mobile: "",
  website: "",
  twitter: "",
  facebook: "",
  streetAddress1: "",
  streetAddress2: "",
  suburb: "",
  city: "",
  postCode: "",
  region: "",
  country: "",
  authAccountNumber: "",
  username: "",
  password: "",
  additionalAuth: "",
  orderNotes: "",
  internalOrderNotes: "",
  emailOrderAutomatically: false,
  emailFormat: "INLINE",
  allowOrdersBelowMinimum: false,
  minimumOrderValue: "",
  maximumOrderValue: "",
  defaultDaysUntilDue: "",
  paymentFeePercentage: "",
  distributeFees: "PROPORTIONALLY",
  distributeFreightAcross: "ITEMS",
  defaultOrderTax: "INCLUDING_TAX",
  freightTax: "GST",
  feesTax: "GST",
  freightIncludedByDefault: true,
  fixedFreightCostPerCase: "",
  comments: "",
};

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
];

const EMAIL_FORMAT_OPTIONS = [
  { label: "Inline", value: "INLINE" },
  { label: "Attachment", value: "ATTACHMENT" },
];

const DISTRIBUTE_FEES_OPTIONS = [
  { label: "Proportionally", value: "PROPORTIONALLY" },
  { label: "Evenly", value: "EVENLY" },
];

const DISTRIBUTE_FREIGHT_OPTIONS = [
  { label: "Items", value: "ITEMS" },
  { label: "Cases", value: "CASES" },
];

const ORDER_TAX_OPTIONS = [
  { label: "Including Tax", value: "INCLUDING_TAX" },
  { label: "Excluding Tax", value: "EXCLUDING_TAX" },
];

const TAX_OPTIONS = [
  { label: "GST", value: "GST" },
  { label: "No Tax", value: "NONE" },
];

const TAX_ID_MAP: Record<string, number> = { GST: 1, NONE: 2 };
const TAX_ID_REVERSE: Record<number, string> = { 1: "GST", 2: "NONE" };

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

const textareaClass =
  "min-h-[100px] w-full resize-y rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

function numStr(v?: number | null) {
  return v === null || v === undefined ? "" : String(v);
}

function supplierDetailToForm(d: SupplierDetail): SupplierForm {
  return {
    ...EMPTY_FORM,
    name: d.name ?? "",
    status: d.status ?? "ACTIVE",
    businessNumber: d.businessNumber ?? "",
    accountNumber: d.accountNumber ?? "",
    mdbId: d.mdbId != null ? String(d.mdbId) : "",
    email: d.email ?? "",
    fax: d.fax ?? "",
    phone: d.phone ?? "",
    mobile: d.mobile ?? "",
    website: d.website ?? "",
    twitter: d.twitter ?? "",
    facebook: d.facebook ?? "",
    streetAddress1: d.streetAddress1 ?? "",
    streetAddress2: d.streetAddress2 ?? "",
    suburb: d.suburb ?? "",
    city: d.city ?? "",
    postCode: d.postCode ?? "",
    region: d.region ?? "",
    country: d.country ?? "",
    orderNotes: d.orderNotes ?? "",
    internalOrderNotes: d.internalOrderNotes ?? "",
    emailOrderAutomatically: d.orderAutomaticEmail ?? false,
    emailFormat: d.emailFormat ?? "INLINE",
    allowOrdersBelowMinimum: d.allowOrderBelowMinimum ?? false,
    minimumOrderValue: numStr(d.minimumOrderValue),
    maximumOrderValue: numStr(d.maximumOrderValue),
    defaultDaysUntilDue: numStr(d.defaultDaysUntilDue),
    paymentFeePercentage: numStr(d.feeAmount),
    distributeFees: d.distributeFees ?? "PROPORTIONALLY",
    distributeFreightAcross: d.distributeFreight ?? "ITEMS",
    defaultOrderTax: d.defaultOrderTax ?? "INCLUDING_TAX",
    freightTax: d.freightTaxId != null ? (TAX_ID_REVERSE[d.freightTaxId] ?? "GST") : "GST",
    feesTax: d.feesTaxId != null ? (TAX_ID_REVERSE[d.feesTaxId] ?? "GST") : "GST",
    freightIncludedByDefault: d.freightIncludedOnInvoices ?? true,
    fixedFreightCostPerCase: numStr(d.freightFixedCostPerCase),
    comments: d.comments ?? "",
    authAccountNumber: d.authAccountNumber ?? "",
    username: d.username ?? "",
    password: "",
    additionalAuth: d.additionalAuth ?? "",
  };
}

function newContactId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function detailToAdditionalContacts(
  contacts?: Array<{ id?: string | number; name?: string; email?: string; phone?: string }>,
): AdditionalContact[] {
  return (contacts ?? []).map((c) => ({
    id: c.id != null ? String(c.id) : newContactId(),
    name: c.name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
  }));
}

function buildSaveBody(form: SupplierForm, additionalContacts: AdditionalContact[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    status: form.status,
    businessNumber: form.businessNumber.trim() || null,
    accountNumber: form.accountNumber.trim() || null,
    email: form.email.trim() || null,
    fax: form.fax.trim() || null,
    phone: form.phone.trim() || null,
    mobile: form.mobile.trim() || null,
    website: form.website.trim() || null,
    twitter: form.twitter.trim() || null,
    facebook: form.facebook.trim() || null,
    streetAddress1: form.streetAddress1.trim() || null,
    streetAddress2: form.streetAddress2.trim() || null,
    suburb: form.suburb.trim() || null,
    city: form.city.trim() || null,
    postCode: form.postCode.trim() || null,
    region: form.region.trim() || null,
    country: form.country.trim() || null,
    orderNotes: form.orderNotes.trim() || null,
    internalOrderNotes: form.internalOrderNotes.trim() || null,
    orderAutomaticEmail: form.emailOrderAutomatically,
    emailFormat: form.emailFormat || null,
    allowOrderBelowMinimum: form.allowOrdersBelowMinimum,
    distributeFees: form.distributeFees || null,
    distributeFreight: form.distributeFreightAcross || null,
    defaultOrderTax: form.defaultOrderTax || null,
    freightIncludedOnInvoices: form.freightIncludedByDefault,
    comments: form.comments.trim() || null,
    authAccountNumber: form.authAccountNumber.trim() || null,
    username: form.username.trim() || null,
    additionalAuth: form.additionalAuth.trim() || null,
    additionalContacts: additionalContacts
      .filter((c) => c.name.trim() || c.email.trim() || c.phone.trim())
      .map((c) => ({
        name: c.name.trim() || null,
        email: c.email.trim() || null,
        phone: c.phone.trim() || null,
      })),
  };

  if (form.password.trim()) body.password = form.password;

  body.mdbId = form.mdbId ? Number(form.mdbId) : null;
  if (form.minimumOrderValue.trim()) body.minimumOrderValue = Number(form.minimumOrderValue);
  if (form.maximumOrderValue.trim()) body.maximumOrderValue = Number(form.maximumOrderValue);
  if (form.defaultDaysUntilDue.trim()) body.defaultDaysUntilDue = Number(form.defaultDaysUntilDue);
  if (form.paymentFeePercentage.trim()) body.feeAmount = Number(form.paymentFeePercentage);
  if (form.fixedFreightCostPerCase.trim()) {
    body.freightFixedCostPerCase = Number(form.fixedFreightCostPerCase);
  }
  if (form.freightTax) body.freightTaxId = TAX_ID_MAP[form.freightTax] ?? null;
  if (form.feesTax) body.feesTaxId = TAX_ID_MAP[form.feesTax] ?? null;

  return body;
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
  icon: typeof InfoIcon;
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
}: {
  label?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

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
      {label && (
        <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      )}
      <div ref={wrapRef} className="relative" data-select-open={open}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
        >
          <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDownIcon
            size={16}
            className={cn("text-[var(--oh-muted)] transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <ul className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-1 shadow-[var(--oh-shadow-card)]">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--oh-surface)]",
                    o.value === value
                      ? "bg-[var(--oh-orange-light)]/40 font-medium text-[var(--oh-text)]"
                      : "text-[var(--oh-text)]",
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}

function FormToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]",
          checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
        )}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
      </button>
      <span className="text-[14px] text-[var(--oh-text)]">{label}</span>
    </label>
  );
}

function PrefixedInput({
  prefix,
  suffix,
  placeholder,
  value,
  onChange,
  type = "text",
}: {
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, prefix && "pl-7", suffix && "pr-8")}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

function supplierPageSnapshot(form: SupplierForm, additionalContacts: AdditionalContact[]): string {
  // Password is never loaded from API; exclude it so browser autofill cannot mark the form dirty.
  const { password, ...formForCompare } = form;
  void password;
  return JSON.stringify({
    form: formForCompare,
    additionalContacts: additionalContacts.map(({ name, email, phone }) => ({ name, email, phone })),
  });
}

function mergeSupplierAiPrefill(base: SupplierForm): SupplierForm {
  if (typeof window === "undefined") return base;
  const prefill = consumeAiCreatePrefill<{ name?: string }>("supplier");
  if (!prefill?.name?.trim()) return base;
  return { ...base, name: prefill.name.trim() };
}

/** Full-page supplier create/edit form with sidebar navigation and accordion sections. */
export function CreateSupplierPage({ supplierId }: { supplierId?: string } = {}) {
  const router = useRouter();
  const { setDirty, confirmNavigation, registerDirtyChecker } = useUnsavedChanges();
  const isEdit = Boolean(supplierId);
  const [form, setForm] = useState<SupplierForm>(() =>
    isEdit ? EMPTY_FORM : mergeSupplierAiPrefill(EMPTY_FORM),
  );
  const [additionalContacts, setAdditionalContacts] = useState<AdditionalContact[]>([]);
  const [mdbOptions, setMdbOptions] = useState<{ label: string; value: string }[]>([]);
  const [mdbLoading, setMdbLoading] = useState(false);
  const [mdbError, setMdbError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [hydrated, setHydrated] = useState(!isEdit);
  const createBaselineRef = useRef<string | null>(null);
  const editBaselineRef = useRef<string | null>(null);
  const passwordTouchedRef = useRef(false);
  useLayoutEffect(() => {
    if (!isEdit && createBaselineRef.current === null) createBaselineRef.current = supplierPageSnapshot(form, []);
  }, [form, isEdit]);

  const supplierQuery = useApi<SupplierDetail>(
    isEdit && supplierId ? `/api/suppliers/${supplierId}` : null,
  );

  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    general: null,
    contact: null,
    address: null,
    "additional-contacts": null,
    authentication: null,
    ordering: null,
    receiving: null,
    miscellaneous: null,
  });

  useEffect(() => {
    if (!isEdit || !supplierQuery.data || hydrated) return;
    const contacts = detailToAdditionalContacts(supplierQuery.data.additionalContacts);
    const nextForm = supplierDetailToForm(supplierQuery.data);
    setForm(nextForm);
    setAdditionalContacts(contacts);
    editBaselineRef.current = supplierPageSnapshot(nextForm, contacts);
    passwordTouchedRef.current = false;
    setHydrated(true);
  }, [supplierQuery.data, hydrated, isEdit]);

  const checkDirty = useCallback(() => {
    const baseline = isEdit ? editBaselineRef.current : createBaselineRef.current;
    if (!baseline) return false;
    const current = supplierPageSnapshot(form, additionalContacts);
    if (current !== baseline) return true;
    return passwordTouchedRef.current && form.password.trim() !== "";
  }, [form, additionalContacts, isEdit]);

  useLayoutEffect(() => {
    registerDirtyChecker(checkDirty);
    setDirty(checkDirty());
    return () => {
      registerDirtyChecker(null);
      setDirty(false);
    };
  }, [checkDirty, registerDirtyChecker, setDirty]);

  function leavePage() {
    confirmNavigation(() => router.push("/suppliers"), checkDirty());
  }

  useDialogFocus(true, leavePage, `supplier-page-${supplierId ?? "new"}`, nameInputRef);

  function set<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const loadMdbReferences = useCallback(async () => {
    if (mdbOptions.length > 0) return;
    setMdbLoading(true);
    setMdbError(null);
    try {
      const items = await api.get<MdbReference[]>("/api/classifications/brand/mdb-references");
      setMdbOptions(items.map((ref) => ({ label: ref.name, value: String(ref.id) })));
    } catch (e) {
      setMdbOptions([]);
      setMdbError(e instanceof Error ? e.message : "Failed to load master database references");
    } finally {
      setMdbLoading(false);
    }
  }, [mdbOptions.length]);

  useEffect(() => {
    void loadMdbReferences();
  }, [loadMdbReferences]);

  function addContact() {
    setAdditionalContacts((prev) => [
      ...prev,
      { id: newContactId(), name: "", email: "", phone: "" },
    ]);
  }

  function updateContact(id: string, patch: Partial<AdditionalContact>) {
    setAdditionalContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeContact(id: string) {
    setAdditionalContacts((prev) => prev.filter((c) => c.id !== id));
  }

  async function save() {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setError("Name is required.");
      scrollToSection("general");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = buildSaveBody(form, additionalContacts);

      if (isEdit && supplierId) {
        await api.put(`/api/suppliers/${supplierId}`, body);
        router.push("/suppliers");
      } else {
        await api.post<SupplierDetail>("/api/suppliers", body);
        router.push("/suppliers");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isEdit
            ? "Failed to update supplier"
            : "Failed to create supplier",
      );
    } finally {
      setBusy(false);
    }
  }

  const displayName = form.name.trim() || "New Supplier";

  return (
    <div className="absolute inset-0 z-50 flex items-stretch justify-center bg-[var(--oh-scrim)] p-4 font-sans md:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex min-h-0 w-full max-w-[1100px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-[var(--oh-surface-elevated)] shadow-2xl"
      >
        <div className="relative shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-6 py-4">
          <h1 id={titleId} className="text-center text-[18px] font-semibold text-[var(--oh-text)] md:text-[20px]">
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

        <div className="flex min-h-0 flex-1 overflow-hidden">
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

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--oh-surface)] px-4 py-5 md:px-6">
            {isEdit && supplierQuery.loading && !hydrated ? (
              <div className="flex h-full min-h-[240px] items-center justify-center text-[15px] text-[var(--oh-muted)]">
                Loading supplier…
              </div>
            ) : isEdit && supplierQuery.error ? (
              <div className="mx-auto max-w-xl space-y-3 py-8 text-center">
                <p className="text-[15px] text-rose-700">{supplierQuery.error}</p>
                <button
                  type="button"
                  onClick={leavePage}
                  className="text-[14px] font-medium text-[var(--oh-primary)] underline"
                >
                  Back to Suppliers
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-xl space-y-4">
                <FormSection
                  id="general"
                  title="General Information"
                  icon={InfoIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.general = el;
                  }}
                >
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">Name</span>
                    <input
                      ref={nameInputRef}
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <FormSelect
                    label="Status"
                    value={form.status}
                    options={STATUS_OPTIONS}
                    onChange={(v) => set("status", v)}
                  />
                  <input
                    value={form.businessNumber}
                    onChange={(e) => set("businessNumber", e.target.value)}
                    placeholder="Business Number"
                    className={inputClass}
                  />
                  <input
                    value={form.accountNumber}
                    onChange={(e) => set("accountNumber", e.target.value)}
                    placeholder="Account Number"
                    className={inputClass}
                  />
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
                      Master Database Reference
                    </span>
                    <ClassificationFormSelect
                      value={form.mdbId}
                      options={mdbOptions}
                      loading={mdbLoading}
                      onChange={(v) => set("mdbId", v)}
                      onOpen={() => void loadMdbReferences()}
                      placeholder="Master Database Reference"
                    />
                    {mdbError && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--oh-danger)]" role="alert">
                        <span>{mdbError}</span>
                        <button type="button" onClick={() => void loadMdbReferences()} className="font-semibold underline">
                          Retry
                        </button>
                      </div>
                    )}
                  </label>
                </FormSection>

                <FormSection
                  id="contact"
                  title="Contact"
                  icon={CalculatorIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.contact = el;
                  }}
                >
                  {(["email", "fax", "phone", "mobile", "website", "twitter", "facebook"] as const).map((field) => (
                    <input
                      key={field}
                      value={form[field]}
                      onChange={(e) => set(field, e.target.value)}
                      placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                      className={inputClass}
                    />
                  ))}
                </FormSection>

                <FormSection
                  id="address"
                  title="Address"
                  icon={BookOpenIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.address = el;
                  }}
                >
                  {(
                    [
                      ["streetAddress1", "Street Address 1"],
                      ["streetAddress2", "Street Address 2"],
                      ["suburb", "Suburb"],
                      ["city", "City"],
                      ["postCode", "Post Code"],
                      ["region", "Region"],
                      ["country", "Country"],
                    ] as const
                  ).map(([key, placeholder]) => (
                    <input
                      key={key}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      placeholder={placeholder}
                      className={inputClass}
                    />
                  ))}
                </FormSection>

                <FormSection
                  id="additional-contacts"
                  title="Additional Contacts"
                  icon={UsersIcon}
                  sectionRef={(el) => {
                    sectionRefs.current["additional-contacts"] = el;
                  }}
                >
                  {additionalContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="space-y-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3"
                    >
                      <input
                        value={contact.name}
                        onChange={(e) => updateContact(contact.id, { name: e.target.value })}
                        placeholder="Name"
                        className={inputClass}
                      />
                      <input
                        value={contact.email}
                        onChange={(e) => updateContact(contact.id, { email: e.target.value })}
                        placeholder="Email"
                        className={inputClass}
                      />
                      <input
                        value={contact.phone}
                        onChange={(e) => updateContact(contact.id, { phone: e.target.value })}
                        placeholder="Phone"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => removeContact(contact.id)}
                        className="text-[13px] font-medium text-[var(--oh-danger)] hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addContact}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-success)] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:opacity-90"
                  >
                    <PlusIcon size={16} /> Add New Contact
                  </button>
                </FormSection>

                <FormSection
                  id="authentication"
                  title="Authentication"
                  icon={LockIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.authentication = el;
                  }}
                >
                  <input
                    value={form.authAccountNumber}
                    onChange={(e) => set("authAccountNumber", e.target.value)}
                    placeholder="Account Number"
                    autoComplete="off"
                    className={inputClass}
                  />
                  <input
                    value={form.username}
                    onChange={(e) => set("username", e.target.value)}
                    placeholder="Username"
                    autoComplete="off"
                    readOnly
                    onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
                    className={inputClass}
                  />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => {
                      passwordTouchedRef.current = true;
                      set("password", e.target.value);
                    }}
                    placeholder="Password"
                    autoComplete="new-password"
                    readOnly
                    onFocus={(e) => e.currentTarget.removeAttribute("readOnly")}
                    className={inputClass}
                  />
                  <input
                    value={form.additionalAuth}
                    onChange={(e) => set("additionalAuth", e.target.value)}
                    placeholder="Additional Authentication"
                    autoComplete="off"
                    className={inputClass}
                  />
                </FormSection>

                <FormSection
                  id="ordering"
                  title="Ordering"
                  icon={ClipboardIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.ordering = el;
                  }}
                >
                  <textarea
                    value={form.orderNotes}
                    onChange={(e) => set("orderNotes", e.target.value)}
                    placeholder="Order Notes"
                    className={textareaClass}
                  />
                  <textarea
                    value={form.internalOrderNotes}
                    onChange={(e) => set("internalOrderNotes", e.target.value)}
                    placeholder="Internal Order Notes"
                    className={textareaClass}
                  />
                  <FormToggle
                    label="Email Order Automatically"
                    checked={form.emailOrderAutomatically}
                    onChange={(v) => set("emailOrderAutomatically", v)}
                  />
                  <FormSelect
                    label="Email Format"
                    value={form.emailFormat}
                    options={EMAIL_FORMAT_OPTIONS}
                    onChange={(v) => set("emailFormat", v)}
                  />
                  <FormToggle
                    label="Allow Orders Below Minimum Order Value"
                    checked={form.allowOrdersBelowMinimum}
                    onChange={(v) => set("allowOrdersBelowMinimum", v)}
                  />
                  <PrefixedInput
                    prefix="$"
                    placeholder="Minimum Order Value"
                    value={form.minimumOrderValue}
                    onChange={(v) => set("minimumOrderValue", v)}
                    type="number"
                  />
                  <PrefixedInput
                    prefix="$"
                    placeholder="Maximum Order Value"
                    value={form.maximumOrderValue}
                    onChange={(v) => set("maximumOrderValue", v)}
                    type="number"
                  />
                  <input
                    value={form.defaultDaysUntilDue}
                    onChange={(e) => set("defaultDaysUntilDue", e.target.value)}
                    placeholder="Default Days Until Due"
                    className={inputClass}
                    type="number"
                  />
                </FormSection>

                <FormSection
                  id="receiving"
                  title="Receiving Orders"
                  icon={CartIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.receiving = el;
                  }}
                >
                  <PrefixedInput
                    suffix="%"
                    placeholder="Payment Fee Percentage"
                    value={form.paymentFeePercentage}
                    onChange={(v) => set("paymentFeePercentage", v)}
                    type="number"
                  />
                  <FormSelect
                    label="Distribute Fees"
                    value={form.distributeFees}
                    options={DISTRIBUTE_FEES_OPTIONS}
                    onChange={(v) => set("distributeFees", v)}
                  />
                  <FormSelect
                    label="Distribute Freight Across"
                    value={form.distributeFreightAcross}
                    options={DISTRIBUTE_FREIGHT_OPTIONS}
                    onChange={(v) => set("distributeFreightAcross", v)}
                  />
                  <FormSelect
                    label="Default Order Tax"
                    value={form.defaultOrderTax}
                    options={ORDER_TAX_OPTIONS}
                    onChange={(v) => set("defaultOrderTax", v)}
                  />
                  <FormSelect
                    label="Freight Tax"
                    value={form.freightTax}
                    options={TAX_OPTIONS}
                    onChange={(v) => set("freightTax", v)}
                  />
                  <FormSelect
                    label="Fees Tax"
                    value={form.feesTax}
                    options={TAX_OPTIONS}
                    onChange={(v) => set("feesTax", v)}
                  />
                  <FormToggle
                    label="Freight included by default on invoices"
                    checked={form.freightIncludedByDefault}
                    onChange={(v) => set("freightIncludedByDefault", v)}
                  />
                  <PrefixedInput
                    prefix="$"
                    placeholder="Fixed Freight Cost Per Case"
                    value={form.fixedFreightCostPerCase}
                    onChange={(v) => set("fixedFreightCostPerCase", v)}
                    type="number"
                  />
                </FormSection>

                <FormSection
                  id="miscellaneous"
                  title="Miscellaneous"
                  icon={PackageIcon}
                  sectionRef={(el) => {
                    sectionRefs.current.miscellaneous = el;
                  }}
                >
                  <textarea
                    value={form.comments}
                    onChange={(e) => set("comments", e.target.value)}
                    placeholder="Comments"
                    className={textareaClass}
                  />
                </FormSection>

                {error && <p role="alert" className="rounded-lg border border-[var(--brand-danger)] bg-[var(--brand-danger-tint)] px-3 py-2.5 text-[14px] text-[var(--brand-danger)]">{error}</p>}
              </div>
            )}
          </div>
        </div>

        <AdminActionFooter>
          <button
            type="button"
            onClick={save}
            disabled={busy || (isEdit && !hydrated)}
            className="flex min-h-11 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-5 text-[15px] font-semibold text-white shadow-[var(--oh-shadow-card)] transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SaveIcon size={18} />
            {busy ? "Saving…" : "Save"}
          </button>
        </AdminActionFooter>
      </div>
    </div>
  );
}
