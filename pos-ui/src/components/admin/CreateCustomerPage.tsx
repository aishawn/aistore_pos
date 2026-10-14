"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOMER_EDIT_PREFILL_STORAGE_KEY,
  CUSTOMER_WIZARD_STORAGE_KEY,
  type CustomerEditPrefill,
} from "@/lib/ai-entity-actions";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import {
  AwardIcon,
  ChevronDownIcon,
  DollarIcon,
  GlobeIcon,
  MailIcon,
  PackageIcon,
  PlusIcon,
  SaveIcon,
  TagIcon,
  TruckIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_FIELD_LIMITS,
  CUSTOMER_LOYALTY_POINTS_MAX,
  validateCustomerFields,
} from "@/lib/customerValidation";

interface Named {
  id: string;
  name: string;
}

/** Re-export for CreateCustomerWizard and other callers. */
export { CUSTOMER_WIZARD_STORAGE_KEY };

export interface CustomerFormData {
  firstName: string;
  lastName: string;
  company: string;
  code: string;
  customerGroupId: string;
  emails: string[];
  phone: string;
  mobile: string;
  fax: string;
  allowMarketingEmails: string;
  website: string;
  twitter: string;
  facebook: string;
  billingStreetAddress1: string;
  billingStreetAddress2: string;
  billingSuburb: string;
  billingPostCode: string;
  billingRegion: string;
  billingCountry: string;
  deliveryStreetAddress1: string;
  deliveryStreetAddress2: string;
  deliverySuburb: string;
  deliveryPostCode: string;
  deliveryRegion: string;
  deliveryCountry: string;
  loyaltyPoints: string;
  disablePromotions: boolean;
  priceListId: string;
  businessNumber: string;
  birthday: string;
  gender: string;
  invoiceMessage: string;
  comments: string;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  firstName: "",
  lastName: "",
  company: "",
  code: "",
  customerGroupId: "",
  emails: [""],
  phone: "",
  mobile: "",
  fax: "",
  allowMarketingEmails: "",
  website: "",
  twitter: "",
  facebook: "",
  billingStreetAddress1: "",
  billingStreetAddress2: "",
  billingSuburb: "",
  billingPostCode: "",
  billingRegion: "",
  billingCountry: "",
  deliveryStreetAddress1: "",
  deliveryStreetAddress2: "",
  deliverySuburb: "",
  deliveryPostCode: "",
  deliveryRegion: "",
  deliveryCountry: "",
  loyaltyPoints: "0",
  disablePromotions: false,
  priceListId: "",
  businessNumber: "",
  birthday: "",
  gender: "",
  invoiceMessage: "",
  comments: "",
};

interface CustomerDetail {
  id: string | number;
  name?: string;
  firstName?: string;
  lastName?: string;
  code?: string;
  company?: string;
  businessNumber?: string;
  birthday?: string;
  gender?: string;
  allowMarketingEmails?: boolean | null;
  email?: string;
  emails?: string[];
  phone?: string;
  mobile?: string;
  fax?: string;
  customerGroupId?: string | number;
  customerGroupName?: string;
  loyaltyEnabled?: boolean;
  loyaltyPoints?: number;
  disablePromotions?: boolean;
  priceListId?: string | number;
  priceListName?: string;
  invoiceMessage?: string;
  comments?: string;
  currentOwing?: number;
  accountLimit?: number;
  website?: string;
  twitter?: string;
  facebook?: string;
  billingStreetAddress1?: string;
  billingStreetAddress2?: string;
  billingSuburb?: string;
  billingPostCode?: string;
  billingRegion?: string;
  billingCountry?: string;
  deliveryStreetAddress1?: string;
  deliveryStreetAddress2?: string;
  deliverySuburb?: string;
  deliveryPostCode?: string;
  deliveryRegion?: string;
  deliveryCountry?: string;
}

export type { CustomerDetail };

function buildName(firstName: string, lastName: string, company: string): string {
  const person = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (person) return person;
  if (company.trim()) return company.trim();
  return "Untitled Customer";
}

function formatBirthday(value?: string | null) {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function customerDetailToForm(c: CustomerDetail): CustomerFormData {
  return {
    ...EMPTY_CUSTOMER_FORM,
    firstName: c.firstName?.trim() || c.name?.trim() || "",
    lastName: c.lastName ?? "",
    company: c.company ?? "",
    code: c.code ?? "",
    customerGroupId: c.customerGroupId != null ? String(c.customerGroupId) : "",
    emails:
      c.emails && c.emails.length > 0
        ? c.emails
        : c.email
          ? [c.email]
          : [""],
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    fax: c.fax ?? "",
    allowMarketingEmails:
      c.allowMarketingEmails === true
        ? "OPTED_IN"
        : c.allowMarketingEmails === false
          ? "OPTED_OUT"
          : "",
    website: c.website ?? "",
    twitter: c.twitter ?? "",
    facebook: c.facebook ?? "",
    billingStreetAddress1: c.billingStreetAddress1 ?? "",
    billingStreetAddress2: c.billingStreetAddress2 ?? "",
    billingSuburb: c.billingSuburb ?? "",
    billingPostCode: c.billingPostCode ?? "",
    billingRegion: c.billingRegion ?? "",
    billingCountry: c.billingCountry ?? "",
    deliveryStreetAddress1: c.deliveryStreetAddress1 ?? "",
    deliveryStreetAddress2: c.deliveryStreetAddress2 ?? "",
    deliverySuburb: c.deliverySuburb ?? "",
    deliveryPostCode: c.deliveryPostCode ?? "",
    deliveryRegion: c.deliveryRegion ?? "",
    deliveryCountry: c.deliveryCountry ?? "",
    loyaltyPoints: c.loyaltyPoints != null ? String(c.loyaltyPoints) : "0",
    disablePromotions: c.disablePromotions ?? false,
    priceListId: c.priceListId != null ? String(c.priceListId) : "",
    businessNumber: c.businessNumber ?? "",
    birthday: formatBirthday(c.birthday),
    gender: c.gender ?? "",
    invoiceMessage: c.invoiceMessage ?? "",
    comments: c.comments ?? "",
  };
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function buildSaveBody(form: CustomerFormData): Record<string, unknown> {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const emails = form.emails.map((e) => e.trim()).filter(Boolean);
  return {
    firstName,
    name: buildName(firstName, lastName, form.company),
    lastName,
    company: nullable(form.company),
    code: form.code.trim() || null,
    phone: nullable(form.phone),
    mobile: nullable(form.mobile),
    fax: nullable(form.fax),
    email: emails[0] || null,
    emails,
    businessNumber: nullable(form.businessNumber),
    birthday: nullable(form.birthday),
    gender: nullable(form.gender) || null,
    invoiceMessage: nullable(form.invoiceMessage),
    comments: nullable(form.comments),
    website: nullable(form.website),
    twitter: nullable(form.twitter),
    facebook: nullable(form.facebook),
    billingStreetAddress1: nullable(form.billingStreetAddress1),
    billingStreetAddress2: nullable(form.billingStreetAddress2),
    billingSuburb: nullable(form.billingSuburb),
    billingPostCode: nullable(form.billingPostCode),
    billingRegion: nullable(form.billingRegion),
    billingCountry: nullable(form.billingCountry),
    deliveryStreetAddress1: nullable(form.deliveryStreetAddress1),
    deliveryStreetAddress2: nullable(form.deliveryStreetAddress2),
    deliverySuburb: nullable(form.deliverySuburb),
    deliveryPostCode: nullable(form.deliveryPostCode),
    deliveryRegion: nullable(form.deliveryRegion),
    deliveryCountry: nullable(form.deliveryCountry),
    customerGroupId: form.customerGroupId ? Number(form.customerGroupId) : null,
    priceListId: form.priceListId ? Number(form.priceListId) : null,
    loyaltyEnabled: Number(form.loyaltyPoints) > 0,
    loyaltyPoints: form.loyaltyPoints ? Number(form.loyaltyPoints) : 0,
    disablePromotions: form.disablePromotions,
    allowMarketingEmails:
      form.allowMarketingEmails === "OPTED_IN"
        ? true
        : form.allowMarketingEmails === "OPTED_OUT"
          ? false
          : true,
  };
}

type SectionId =
  | "general"
  | "contact"
  | "social"
  | "billing"
  | "delivery"
  | "loyalty"
  | "pricing"
  | "misc";

function validateCustomerForm(form: CustomerFormData): { message: string; section: SectionId } | null {
  return validateCustomerFields(form);
}

const SECTIONS: { id: SectionId; label: string; Icon: typeof UserIcon }[] = [
  { id: "general", label: "General Information", Icon: UserIcon },
  { id: "contact", label: "Contact", Icon: MailIcon },
  { id: "social", label: "Social Media", Icon: GlobeIcon },
  { id: "billing", label: "Billing Address", Icon: DollarIcon },
  { id: "delivery", label: "Delivery Address", Icon: TruckIcon },
  { id: "loyalty", label: "Loyalty", Icon: AwardIcon },
  { id: "pricing", label: "Special Pricing", Icon: TagIcon },
  { id: "misc", label: "Miscellaneous", Icon: PackageIcon },
];

const MARKETING_OPTIONS = [
  { label: "Opted In", value: "OPTED_IN" },
  { label: "Opted Out", value: "OPTED_OUT" },
  { label: "Not Specified", value: "" },
];

const GENDER_OPTIONS = [
  { label: "Not Specified", value: "" },
  { label: "Male", value: "MALE" },
  { label: "Female", value: "FEMALE" },
  { label: "Other", value: "OTHER" },
];

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

const textareaClass =
  "min-h-[88px] w-full resize-y rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 py-2.5 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

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
  icon: typeof UserIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      id={`section-${id}`}
      ref={sectionRef}
      className="relative scroll-mt-4 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-sm has-[[data-select-open=true]]:z-30"
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
}: {
  label?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => String(o.value) === String(value));

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
      {label && <FormLabel required={required}>{label}</FormLabel>}
      <div ref={wrapRef} className="relative" data-select-open={open || undefined}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
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
          <ul className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
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
                    String(o.value) === String(value)
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

function FormSearchSelect({
  label,
  value,
  options,
  onChange,
  loading = false,
  placeholder = "Select…",
  searchPlaceholder = "Keep Typing to Search...",
}: {
  label?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  loading?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => String(o.value) === String(value));
  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.label.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  function openDropdown() {
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closeDropdown();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const inputValue = open ? query : (selected?.label ?? "");

  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      )}
      <div ref={wrapRef} className="relative" data-select-open={open || undefined}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            placeholder={placeholder}
            onFocus={openDropdown}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (!e.target.value.trim()) onChange("");
            }}
            className="flex h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-0 pl-3 pr-9 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
          />
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (open ? closeDropdown() : openDropdown())}
            className="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-[var(--oh-muted)]"
            aria-label={open ? "Close options" : "Open options"}
          >
            <ChevronDownIcon size={16} className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </div>
        {open && (
          <ul className="absolute z-[200] mt-1 max-h-48 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
            {loading ? (
              <li className="px-3 py-2 text-[14px] text-[var(--oh-muted)]">Loading…</li>
            ) : trimmedQuery === "" ? (
              <li className="px-3 py-2 text-[14px] text-[var(--oh-placeholder)]">{searchPlaceholder}</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-[14px] text-[var(--oh-muted)]">No results found</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(o.value);
                      closeDropdown();
                    }}
                    className={cn(
                      "flex w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--oh-surface)]",
                      String(o.value) === String(value)
                        ? "bg-[var(--oh-orange-light)]/40 font-medium text-[var(--oh-text)]"
                        : "text-[var(--oh-text)]",
                    )}
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
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
        )}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
      </button>
      <span className="text-[14px] text-[var(--oh-text)]">{label}</span>
    </label>
  );
}

function mergeWizardData(base: CustomerFormData): CustomerFormData {
  if (typeof window === "undefined") return base;
  try {
    const raw = sessionStorage.getItem(CUSTOMER_WIZARD_STORAGE_KEY);
    if (!raw) return base;
    sessionStorage.removeItem(CUSTOMER_WIZARD_STORAGE_KEY);
    const wizard = JSON.parse(raw) as {
      firstName?: string;
      lastName?: string;
      customerGroupId?: string;
      code?: string;
      email?: string;
      emails?: string[];
    };
    const emails =
      Array.isArray(wizard.emails) && wizard.emails.some((e) => e?.trim())
        ? wizard.emails.map((e) => e ?? "")
        : wizard.email
          ? [wizard.email]
          : base.emails;
    return {
      ...base,
      firstName: wizard.firstName ?? base.firstName,
      lastName: wizard.lastName ?? base.lastName,
      customerGroupId: wizard.customerGroupId ?? base.customerGroupId,
      code: wizard.code ?? base.code,
      emails: emails.length > 0 ? emails : base.emails,
    };
  } catch {
    return base;
  }
}

function mergeEditPrefill(base: CustomerFormData): CustomerFormData {
  if (typeof window === "undefined") return base;
  try {
    const raw = sessionStorage.getItem(CUSTOMER_EDIT_PREFILL_STORAGE_KEY);
    if (!raw) return base;
    sessionStorage.removeItem(CUSTOMER_EDIT_PREFILL_STORAGE_KEY);
    const patch = JSON.parse(raw) as CustomerEditPrefill;
    return {
      ...base,
      firstName: patch.firstName?.trim() || base.firstName,
      lastName: patch.lastName?.trim() || base.lastName,
      code: patch.code?.trim() || base.code,
      emails: patch.email?.trim()
        ? [patch.email.trim(), ...base.emails.slice(1)]
        : base.emails,
      phone: patch.phone?.trim() || base.phone,
      mobile: patch.mobile?.trim() || base.mobile,
    };
  } catch {
    return base;
  }
}

function customerFormSnapshot(form: CustomerFormData): string {
  return JSON.stringify(form);
}

/** Full-page customer create/edit form with sidebar navigation and accordion sections. */
export function CreateCustomerPage({ customerId }: { customerId?: string } = {}) {
  const router = useRouter();
  const { setDirty, confirmNavigation, registerDirtyChecker } = useUnsavedChanges();
  const isEdit = Boolean(customerId);
  const [form, setForm] = useState<CustomerFormData>(() =>
    isEdit ? EMPTY_CUSTOMER_FORM : mergeWizardData(EMPTY_CUSTOMER_FORM),
  );
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!isEdit);
  const createBaselineRef = useRef<string | null>(null);
  const editBaselineRef = useRef<string | null>(null);
  if (!isEdit && createBaselineRef.current === null) {
    createBaselineRef.current = customerFormSnapshot(form);
  }

  const customerQuery = useApi<CustomerDetail>(
    isEdit && customerId ? `/api/customers/${customerId}` : null,
  );

  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    general: null,
    contact: null,
    social: null,
    billing: null,
    delivery: null,
    loyalty: null,
    pricing: null,
    misc: null,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const groupsQuery = useApiList<Named>("/api/customers/groups", { page: 1, size: DROPDOWN_PAGE_SIZE });
  const groupOptions = (groupsQuery.items ?? [])
    .filter((g) => g.id != null && String(g.id).trim() !== "" && g.name?.trim())
    .map((g) => ({
      label: g.name.trim(),
      value: String(g.id),
    }));
  const priceListsQuery = useApiList<Named>("/api/price-lists", { page: 1, size: DROPDOWN_PAGE_SIZE });
  const priceListOptions = (priceListsQuery.items ?? []).map((p) => ({
    label: p.name,
    value: String(p.id),
  }));

  useEffect(() => {
    if (!isEdit || !customerQuery.data || hydrated) return;
    const nextForm = mergeEditPrefill(customerDetailToForm(customerQuery.data));
    setForm(nextForm);
    editBaselineRef.current = customerFormSnapshot(nextForm);
    setHydrated(true);
  }, [customerQuery.data, hydrated, isEdit]);

  // Create: prefer default group, then first available; auto-fill code if empty.
  useEffect(() => {
    if (isEdit || groupsQuery.loading) return;
    const items = (groupsQuery.items ?? []).filter(
      (g) => g.id != null && String(g.id).trim() !== "" && g.name?.trim(),
    );
    const preferred =
      items.find((g) => g.name.trim().toLowerCase() === "default") ??
      items.find((g) => g.name.trim() === "默认分组") ??
      items[0];
    const preferredId = preferred ? String(preferred.id) : "";
    setForm((prev) => {
      let changed = false;
      const next = { ...prev };
      if (!prev.customerGroupId && preferredId) {
        next.customerGroupId = preferredId;
        changed = true;
      }
      if (!prev.code.trim()) {
        next.code = `C${Date.now()}`.slice(0, CUSTOMER_FIELD_LIMITS.code);
        changed = true;
      }
      if (!changed) return prev;
      if (createBaselineRef.current === customerFormSnapshot(prev)) {
        createBaselineRef.current = customerFormSnapshot(next);
      }
      return next;
    });
  }, [isEdit, groupsQuery.loading, groupsQuery.items]);

  const checkDirty = useCallback(() => {
    const baseline = isEdit ? editBaselineRef.current : createBaselineRef.current;
    if (!baseline) return false;
    return customerFormSnapshot(form) !== baseline;
  }, [form, isEdit]);

  useLayoutEffect(() => {
    registerDirtyChecker(checkDirty);
    setDirty(checkDirty());
    return () => {
      registerDirtyChecker(null);
      setDirty(false);
    };
  }, [checkDirty, registerDirtyChecker, setDirty]);

  function leavePage() {
    confirmNavigation(() => router.push("/customers"), checkDirty());
  }

  function set<K extends keyof CustomerFormData>(key: K, value: CustomerFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function scrollToSection(id: SectionId) {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addEmail() {
    setForm((prev) => ({ ...prev, emails: [...prev.emails, ""] }));
  }

  function updateEmail(index: number, value: string) {
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.map((e, i) => (i === index ? value : e)),
    }));
  }

  function removeEmail(index: number) {
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.length <= 1 ? [""] : prev.emails.filter((_, i) => i !== index),
    }));
  }

  async function save() {
    const validation = validateCustomerForm(form);
    if (validation) {
      setError(validation.message);
      scrollToSection(validation.section);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = buildSaveBody(form);

      if (isEdit && customerId) {
        await api.put(`/api/customers/${customerId}`, body);
      } else {
        await api.post("/api/customers", body);
      }
      router.push("/customers");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : isEdit
            ? "Failed to update customer"
            : "Failed to create customer",
      );
    } finally {
      setBusy(false);
    }
  }

  const displayName = buildName(form.firstName, form.lastName, form.company);

  const addressFields = (
    prefix: "billing" | "delivery",
    placeholders: [string, string, string, string, string, string],
  ) => {
    const keys = [
      `${prefix}StreetAddress1`,
      `${prefix}StreetAddress2`,
      `${prefix}Suburb`,
      `${prefix}PostCode`,
      `${prefix}Region`,
      `${prefix}Country`,
    ] as const;
    return keys.map((key, i) => (
      <input
        key={key}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholders[i]}
        maxLength={CUSTOMER_FIELD_LIMITS[key]}
        className={inputClass}
      />
    ));
  };

  return (
    <div className="absolute inset-0 z-50 flex items-stretch justify-center bg-slate-950/40 p-2 font-sans sm:p-4 md:p-6">
      <div className="flex min-h-0 w-full max-w-[1100px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-2xl">
        {/* Header */}
        <div className="relative shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-3 sm:px-6 sm:py-4">
          <h1 className="break-words px-10 text-center text-lg font-semibold leading-6 text-[var(--oh-text)] md:text-xl">
            {displayName}
          </h1>
          <button
            type="button"
            onClick={leavePage}
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-[var(--oh-muted)] outline-none hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] sm:right-4"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Sidebar */}
          <nav aria-label="Customer form sections" className="max-w-full shrink-0 overflow-x-auto border-b border-[var(--oh-border)] bg-[var(--oh-surface)] md:w-[220px] md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r">
            <ul className="flex w-max gap-1 px-2 py-2 md:block md:w-auto md:gap-0 md:px-0">
              {SECTIONS.map(({ id, label, Icon }) => (
                <li key={id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => scrollToSection(id)}
                    aria-current={activeSection === id ? "location" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] md:rounded-none md:px-4 md:py-2.5",
                      activeSection === id
                        ? "bg-white text-[var(--oh-primary)] shadow-sm md:shadow-none"
                        : "text-[var(--oh-text-secondary)] hover:bg-white hover:text-[var(--oh-text)]",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Main content */}
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[var(--oh-surface)] px-3 py-4 sm:px-5 sm:py-5 md:px-6"
          >
            {isEdit && customerQuery.loading && !hydrated ? (
              <div className="flex h-full min-h-[240px] items-center justify-center text-[15px] text-[var(--oh-muted)]">
                Loading customer…
              </div>
            ) : isEdit && customerQuery.error ? (
              <div className="mx-auto max-w-xl space-y-3 py-8 text-center">
                <p role="alert" className="text-[15px] text-[var(--oh-danger)]">{customerQuery.error}</p>
                <button
                  type="button"
                  onClick={leavePage}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-[14px] font-medium text-[var(--oh-primary)] underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                >
                  Back to Customers
                </button>
              </div>
            ) : (
            <div className="mx-auto max-w-xl space-y-4">
              <FormSection
                id="general"
                title="General Information"
                icon={UserIcon}
                sectionRef={(el) => {
                  sectionRefs.current.general = el;
                }}
              >
                <label className="block">
                  <FormLabel required>First Name</FormLabel>
                  <input
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    maxLength={CUSTOMER_FIELD_LIMITS.firstName}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <FormLabel required>Last Name</FormLabel>
                  <input
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    maxLength={CUSTOMER_FIELD_LIMITS.lastName}
                    className={inputClass}
                  />
                </label>
                <input
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  placeholder="Company"
                  maxLength={CUSTOMER_FIELD_LIMITS.company}
                  className={inputClass}
                />
                <label className="block">
                  <FormLabel>Code</FormLabel>
                  <input
                    value={form.code}
                    onChange={(e) => set("code", e.target.value)}
                    placeholder="Auto-generated if empty"
                    maxLength={CUSTOMER_FIELD_LIMITS.code}
                    className={inputClass}
                  />
                </label>
                <FormSelect
                  label="Customer Group"
                  value={form.customerGroupId}
                  options={groupOptions}
                  onChange={(v) => set("customerGroupId", String(v))}
                  placeholder={groupsQuery.loading ? "Loading…" : "Select…"}
                />
              </FormSection>

              <FormSection
                id="contact"
                title="Contact"
                icon={MailIcon}
                sectionRef={(el) => {
                  sectionRefs.current.contact = el;
                }}
              >
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <FormLabel>Emails</FormLabel>
                    <button
                      type="button"
                      onClick={addEmail}
                      className="text-[13px] font-semibold text-[var(--oh-info)] hover:underline"
                    >
                      Add +
                    </button>
                  </div>
                  <div className="space-y-2">
                    {form.emails.map((email, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => updateEmail(i, e.target.value)}
                          placeholder="Email"
                          maxLength={CUSTOMER_FIELD_LIMITS.email}
                          className={inputClass}
                        />
                        {form.emails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeEmail(i)}
                            className="shrink-0 px-2 text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
                            aria-label="Remove email"
                          >
                            <XIcon size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="Phone"
                  maxLength={CUSTOMER_FIELD_LIMITS.phone}
                  className={inputClass}
                />
                <input
                  value={form.mobile}
                  onChange={(e) => set("mobile", e.target.value)}
                  placeholder="Mobile"
                  maxLength={CUSTOMER_FIELD_LIMITS.mobile}
                  className={inputClass}
                />
                <input
                  value={form.fax}
                  onChange={(e) => set("fax", e.target.value)}
                  placeholder="Fax"
                  maxLength={CUSTOMER_FIELD_LIMITS.fax}
                  className={inputClass}
                />
                <FormSelect
                  label="Allow Marketing Emails"
                  value={form.allowMarketingEmails}
                  options={MARKETING_OPTIONS}
                  onChange={(v) => set("allowMarketingEmails", v)}
                  placeholder="Not Specified"
                />
              </FormSection>

              <FormSection
                id="social"
                title="Social Media"
                icon={GlobeIcon}
                sectionRef={(el) => {
                  sectionRefs.current.social = el;
                }}
              >
                <input
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                  placeholder="Website"
                  maxLength={CUSTOMER_FIELD_LIMITS.website}
                  className={inputClass}
                />
                <input
                  value={form.twitter}
                  onChange={(e) => set("twitter", e.target.value)}
                  placeholder="Twitter"
                  maxLength={CUSTOMER_FIELD_LIMITS.twitter}
                  className={inputClass}
                />
                <input
                  value={form.facebook}
                  onChange={(e) => set("facebook", e.target.value)}
                  placeholder="Facebook"
                  maxLength={CUSTOMER_FIELD_LIMITS.facebook}
                  className={inputClass}
                />
              </FormSection>

              <FormSection
                id="billing"
                title="Billing Address"
                icon={DollarIcon}
                sectionRef={(el) => {
                  sectionRefs.current.billing = el;
                }}
              >
                {addressFields("billing", [
                  "Street Address 1",
                  "Street Address 2",
                  "Suburb",
                  "Postcode / ZIP Code",
                  "State / Province",
                  "Country",
                ])}
              </FormSection>

              <FormSection
                id="delivery"
                title="Delivery Address"
                icon={TruckIcon}
                sectionRef={(el) => {
                  sectionRefs.current.delivery = el;
                }}
              >
                {addressFields("delivery", [
                  "Street Address 1",
                  "Street Address 2",
                  "Suburb",
                  "Postcode / ZIP Code",
                  "State / Province",
                  "Country",
                ])}
              </FormSection>

              <FormSection
                id="loyalty"
                title="Loyalty"
                icon={AwardIcon}
                sectionRef={(el) => {
                  sectionRefs.current.loyalty = el;
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
                    Loyalty Points
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={CUSTOMER_LOYALTY_POINTS_MAX}
                    step="any"
                    value={form.loyaltyPoints}
                    onChange={(e) => set("loyaltyPoints", e.target.value)}
                    className={inputClass}
                  />
                </label>
              </FormSection>

              <FormSection
                id="pricing"
                title="Special Pricing"
                icon={TagIcon}
                sectionRef={(el) => {
                  sectionRefs.current.pricing = el;
                }}
              >
                <FormToggle
                  label="Disable Promotions"
                  checked={form.disablePromotions}
                  onChange={(v) => set("disablePromotions", v)}
                />
                <FormSearchSelect
                  label="Price List"
                  value={form.priceListId}
                  options={priceListOptions}
                  loading={priceListsQuery.loading}
                  onChange={(v) => set("priceListId", v)}
                  placeholder="Select…"
                />
              </FormSection>

              <FormSection
                id="misc"
                title="Miscellaneous"
                icon={PackageIcon}
                defaultOpen
                sectionRef={(el) => {
                  sectionRefs.current.misc = el;
                }}
              >
                <input
                  value={form.businessNumber}
                  onChange={(e) => set("businessNumber", e.target.value)}
                  placeholder="Business Number"
                  maxLength={CUSTOMER_FIELD_LIMITS.businessNumber}
                  className={inputClass}
                />
                <FormDatePicker
                  value={form.birthday}
                  onChange={(v) => set("birthday", v)}
                  placeholder="Birthday"
                />
                <FormSelect
                  label="Gender"
                  value={form.gender}
                  options={GENDER_OPTIONS}
                  onChange={(v) => set("gender", v)}
                  placeholder="Not Specified"
                />
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
                    Invoice and Statement Message
                  </span>
                  <textarea
                    value={form.invoiceMessage}
                    onChange={(e) => set("invoiceMessage", e.target.value)}
                    maxLength={CUSTOMER_FIELD_LIMITS.invoiceMessage}
                    className={textareaClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-[var(--oh-text-secondary)]">
                    Comments (internal)
                  </span>
                  <textarea
                    value={form.comments}
                    onChange={(e) => set("comments", e.target.value)}
                    maxLength={CUSTOMER_FIELD_LIMITS.comments}
                    className={textareaClass}
                  />
                </label>
              </FormSection>

            </div>
            )}
          </div>
        </div>

        {/* Persistent form action */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--oh-border)] bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-6">
          {error && <p role="alert" className="min-w-0 text-sm text-red-900 sm:flex-1">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={busy || (isEdit && !hydrated)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-5 py-2.5 text-[15px] font-semibold text-white outline-none transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            <SaveIcon size={18} />
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
