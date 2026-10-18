"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  MergeIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { AsyncDependencyNotice, AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { DEFAULT_PAGE_SIZE, DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import {
  EMPTY_CUSTOMER_FORM,
  type CustomerFormData,
} from "@/components/admin/CreateCustomerPage";
import { getCustomerFieldLimit } from "@/lib/customerValidation";

interface Named {
  id: string;
  name: string;
}

interface ApiCustomer {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  code?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  businessNumber?: string;
  birthday?: string;
  customerGroupId?: string;
  customerGroupName?: string;
}

interface CustomerListItem {
  id: string;
  name: string;
  company?: string;
  code?: string;
  email?: string;
  phone?: string;
  customerGroupName?: string;
}

interface MergeSource {
  id: string;
  data: CustomerFormData;
  label: string;
}

type SectionId = "general" | "contact" | "social" | "billing" | "delivery" | "misc";

type MergeFieldKey = keyof CustomerFormData;

interface FieldDef {
  key: MergeFieldKey;
  label: string;
  required?: boolean;
  type?: "text" | "textarea" | "select" | "emails";
  placeholder?: string;
}

interface SectionDef {
  id: SectionId;
  title: string;
  fields: FieldDef[];
}

const GENDER_OPTIONS = [
  { label: "Select…", value: "" },
  { label: "Male", value: "MALE" },
  { label: "Female", value: "FEMALE" },
  { label: "Other", value: "OTHER" },
];

const MERGE_SECTIONS: SectionDef[] = [
  {
    id: "general",
    title: "General",
    fields: [
      { key: "firstName", label: "First Name", required: true },
      { key: "lastName", label: "Last Name", required: true },
      { key: "company", label: "Company" },
      { key: "code", label: "Code" },
      { key: "customerGroupId", label: "Customer Group", type: "select" },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    fields: [
      { key: "emails", label: "Emails", type: "emails" },
      { key: "phone", label: "Phone" },
      { key: "mobile", label: "Mobile" },
      { key: "fax", label: "Fax" },
    ],
  },
  {
    id: "social",
    title: "Social Media",
    fields: [
      { key: "website", label: "Website" },
      { key: "twitter", label: "Twitter" },
      { key: "facebook", label: "Facebook" },
    ],
  },
  {
    id: "billing",
    title: "Billing Address",
    fields: [
      { key: "billingStreetAddress1", label: "Street Address 1" },
      { key: "billingStreetAddress2", label: "Street Address 2" },
      { key: "billingSuburb", label: "Suburb" },
      { key: "billingPostCode", label: "Postcode / ZIP Code" },
      { key: "billingRegion", label: "State / Province" },
      { key: "billingCountry", label: "Country" },
    ],
  },
  {
    id: "delivery",
    title: "Delivery Address",
    fields: [
      { key: "deliveryStreetAddress1", label: "Street Address 1" },
      { key: "deliveryStreetAddress2", label: "Street Address 2" },
      { key: "deliverySuburb", label: "Suburb" },
      { key: "deliveryPostCode", label: "Postcode / ZIP Code" },
      { key: "deliveryRegion", label: "State / Province" },
      { key: "deliveryCountry", label: "Country" },
    ],
  },
  {
    id: "misc",
    title: "Miscellaneous",
    fields: [
      { key: "businessNumber", label: "Business Number" },
      { key: "birthday", label: "Birthday", placeholder: "DD/MM/YYYY" },
      { key: "gender", label: "Gender", type: "select" },
      { key: "invoiceMessage", label: "Invoice and Statement Message", type: "textarea" },
      { key: "comments", label: "Comments (Internal)", type: "textarea" },
    ],
  },
];

const SECTION_FIELD_KEYS: Record<SectionId, MergeFieldKey[]> = MERGE_SECTIONS.reduce(
  (acc, section) => {
    acc[section.id] = section.fields.map((f) => f.key);
    return acc;
  },
  {} as Record<SectionId, MergeFieldKey[]>,
);

/** Fixed column width so many customers scroll horizontally instead of squashing. */
const MERGE_COLUMN_WIDTH_PX = 320;
const MERGE_ADD_COLUMN_WIDTH_PX = 280;

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 text-[14px] text-[var(--oh-text)] shadow-sm outline-none placeholder:text-[var(--oh-placeholder)] transition-colors focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[var(--oh-orange-muted)]";

const textareaClass =
  "min-h-[80px] w-full resize-y rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-3 py-2.5 text-[14px] text-[var(--oh-text)] shadow-sm outline-none placeholder:text-[var(--oh-placeholder)] transition-colors focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[var(--oh-orange-muted)]";

const readOnlyInputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)]/80 bg-white/90 px-3 text-[14px] text-[var(--oh-text)]";

function buildLabel(firstName: string, lastName: string, company: string, name?: string): string {
  const person = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (person) return person;
  if (company.trim()) return company.trim();
  if (name?.trim()) return name.trim();
  return "Customer";
}

function apiToFormData(c: ApiCustomer, groupName?: string): CustomerFormData {
  return {
    ...EMPTY_CUSTOMER_FORM,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    company: c.company ?? "",
    code: c.code ?? "",
    customerGroupId: c.customerGroupId ? String(c.customerGroupId) : "",
    emails: c.email ? [c.email] : [""],
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    businessNumber: c.businessNumber ?? "",
    birthday: c.birthday ?? "",
    ...(groupName ? { customerGroupId: c.customerGroupId ? String(c.customerGroupId) : "" } : {}),
  };
}

function formatBirthday(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function fieldHasValue(data: CustomerFormData, key: MergeFieldKey, groupLabel?: string): boolean {
  if (key === "emails") return data.emails.some((e) => e.trim());
  if (key === "customerGroupId") return Boolean(data.customerGroupId || groupLabel);
  const v = data[key];
  if (typeof v === "boolean") return v;
  return Boolean(String(v ?? "").trim());
}

function customerInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "CU";
}

function FieldCheckButton({
  active,
  onClick,
  disabled,
}: {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Select field"
      title={disabled ? undefined : "Use this value in merged result"}
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-all",
        active
          ? "border-[var(--oh-info)] bg-[var(--oh-info)] text-white shadow-sm"
          : "border-[#b8d4f0] bg-white text-[#b8d4f0]",
        disabled
          ? "cursor-default opacity-70"
          : "cursor-pointer hover:scale-105 hover:border-[var(--oh-info)] hover:bg-[var(--oh-info)] hover:text-white",
      )}
    >
      <CircleCheckIcon size={13} strokeWidth={2.5} />
    </button>
  );
}

function MergeField({
  field,
  data,
  groupLabel,
  selectedKey,
  onSelect,
  onChange,
  readOnly,
  groupOptions,
}: {
  field: FieldDef;
  data: CustomerFormData;
  groupLabel?: string;
  selectedKey?: MergeFieldKey | null;
  onSelect?: () => void;
  onChange?: (key: MergeFieldKey, value: CustomerFormData[MergeFieldKey]) => void;
  readOnly?: boolean;
  groupOptions: { label: string; value: string }[];
}) {
  const active = selectedKey === field.key;
  const hasValue = fieldHasValue(data, field.key, groupLabel);
  const maxLength = getCustomerFieldLimit(field.key);

  function renderInput() {
    if (field.type === "emails") {
      const email = data.emails.map((e) => e.trim()).find(Boolean) ?? "";
      if (readOnly && !email) {
        return (
          <div className={cn(readOnlyInputClass, "flex items-center italic text-[var(--oh-placeholder)]")}>
            No value
          </div>
        );
      }
      return (
        <input
          value={readOnly ? email : data.emails[0] ?? ""}
          readOnly={readOnly}
          onChange={(e) => onChange?.("emails", [e.target.value])}
          maxLength={maxLength}
          className={readOnly ? readOnlyInputClass : inputClass}
        />
      );
    }

    if (field.key === "customerGroupId") {
      const label =
        groupOptions.find((o) => o.value === data.customerGroupId)?.label ??
        groupLabel ??
        "";
      if (readOnly) {
        return (
          <div className={cn(readOnlyInputClass, "flex items-center justify-between pr-2")}>
            <span className={label ? "text-[var(--oh-text)]" : "italic text-[var(--oh-placeholder)]"}>
              {label || "No value"}
            </span>
          </div>
        );
      }
      return (
        <select
          value={data.customerGroupId}
          onChange={(e) => onChange?.("customerGroupId", e.target.value)}
          className={inputClass}
        >
          <option value="">No Value</option>
          {groupOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "select" && field.key === "gender") {
      return (
        <select
          value={data.gender}
          disabled={readOnly}
          onChange={(e) => onChange?.("gender", e.target.value)}
          className={readOnly ? readOnlyInputClass : inputClass}
        >
          {GENDER_OPTIONS.map((o) => (
            <option key={o.value || "none"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "textarea") {
      return (
        <textarea
          value={String(data[field.key] ?? "")}
          readOnly={readOnly}
          onChange={(e) => onChange?.(field.key, e.target.value)}
          maxLength={maxLength}
          className={readOnly ? cn(readOnlyInputClass, "min-h-[80px] resize-none py-2.5") : textareaClass}
        />
      );
    }

    const value =
      field.key === "birthday" && readOnly ? formatBirthday(String(data[field.key] ?? "")) : String(data[field.key] ?? "");

    if (field.key === "code" && !readOnly) {
      return (
        <div className="relative">
          <input
            value={value}
            onChange={(e) => onChange?.(field.key, e.target.value)}
            maxLength={maxLength}
            className={cn(inputClass, "pr-9")}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange?.(field.key, "")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]"
              aria-label="Clear"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
      );
    }

    return (
      <input
        value={value}
        readOnly={readOnly}
        placeholder={field.placeholder}
        onChange={(e) => onChange?.(field.key, e.target.value)}
        maxLength={maxLength}
        className={readOnly ? readOnlyInputClass : inputClass}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[var(--oh-text-secondary)]">
          {field.label}
          {field.required && <span className="ml-0.5 text-[var(--oh-danger)]">*</span>}
        </span>
        <FieldCheckButton
          active={active || (readOnly === false && hasValue)}
          onClick={onSelect}
          disabled={readOnly === false || !onSelect || !hasValue}
        />
      </div>
      {renderInput()}
    </div>
  );
}

function MergeSection({
  section,
  data,
  groupLabel,
  selectedFields,
  onSelectField,
  onSelectSection,
  onChange,
  readOnly,
  groupOptions,
}: {
  section: SectionDef;
  data: CustomerFormData;
  groupLabel?: string;
  selectedFields?: Set<MergeFieldKey>;
  onSelectField?: (key: MergeFieldKey) => void;
  onSelectSection?: () => void;
  onChange?: (key: MergeFieldKey, value: CustomerFormData[MergeFieldKey]) => void;
  readOnly?: boolean;
  groupOptions: { label: string; value: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          readOnly
            ? "border-b border-[var(--oh-border)] bg-[var(--oh-surface)]"
            : "border-b border-[var(--oh-tile-blue-border)] bg-[var(--oh-tile-blue-bg)]",
        )}
      >
        <span className="text-[14px] font-semibold text-[var(--oh-text)]">{section.title}</span>
        {onSelectSection && (
          <button
            type="button"
            onClick={onSelectSection}
            className="rounded-[var(--oh-radius)] border border-[var(--oh-orange)] bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--oh-orange)] transition-colors hover:bg-[var(--oh-orange-light)]"
          >
            Select Section
          </button>
        )}
      </div>
      <div className="space-y-4 px-4 py-4">
        {section.fields.map((field) => (
          <MergeField
            key={field.key}
            field={field}
            data={data}
            groupLabel={groupLabel}
            selectedKey={selectedFields?.has(field.key) ? field.key : null}
            onSelect={onSelectField ? () => onSelectField(field.key) : undefined}
            onChange={onChange}
            readOnly={readOnly}
            groupOptions={groupOptions}
          />
        ))}
      </div>
    </div>
  );
}

function CustomerPickerModal({
  open,
  onClose,
  onSelect,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (customer: CustomerListItem) => void;
  excludeIds: Set<string>;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, total, loading, error, reload } = useApiList<CustomerListItem>("/api/customers", {
    name: debouncedSearch.trim() || undefined,
    page,
    size: DEFAULT_PAGE_SIZE,
  });

  const available = items.filter((c) => !excludeIds.has(String(c.id)));

  useDialogFocus(open, onClose, `customer-merge-picker-${titleId}`, searchInputRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 font-sans backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-tile-blue-bg)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[18px] font-semibold text-[var(--oh-text)]">Select Customer</h2>
            <p className="mt-0.5 text-[13px] text-[var(--oh-muted)]">Search by name, email, or code</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--oh-radius)] text-[var(--oh-muted)] hover:bg-white/60"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="border-b border-[var(--oh-border)] px-5 py-4">
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search customers…"
              ref={searchInputRef}
              className="h-11 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white pl-10 pr-3 text-[14px] shadow-sm outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[var(--oh-orange-muted)]"
            />
          </div>
        </div>

        <div className="min-h-[280px] flex-1 overflow-auto px-3 py-2">
          <AsyncState loading={loading} error={error} empty={available.length === 0} onRetry={reload}>
            <ul className="space-y-1">
              {available.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      onClose();
                    }}
                    className="flex w-full items-start gap-3 rounded-[var(--oh-radius)] px-3 py-3 text-left transition-colors hover:bg-[var(--oh-surface)]"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--oh-primary)] text-[13px] font-bold text-white">
                      {customerInitials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[var(--oh-text)]">{c.name}</span>
                      {(c.company || c.code) && (
                        <span className="mt-0.5 block text-[13px] text-[var(--oh-muted)]">
                          {[c.company, c.code].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {(c.email || c.phone) && (
                        <span className="mt-0.5 block text-[13px] text-[var(--oh-text-secondary)]">
                          {[c.email, c.phone].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </AsyncState>
        </div>

        <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)] px-5 py-3">
          <Pagination page={page} size={DEFAULT_PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

/** Customer merge workspace: pick fields from multiple customers into a single result. */
export function CustomerMergePage() {
  const router = useRouter();
  const [sources, setSources] = useState<MergeSource[]>([]);
  const [results, setResults] = useState<CustomerFormData>(EMPTY_CUSTOMER_FORM);
  const [selectedFields, setSelectedFields] = useState<Set<MergeFieldKey>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupsQuery = useApiList<Named>("/api/customers/groups", { page: 1, size: DROPDOWN_PAGE_SIZE });
  const groupOptions = useMemo(
    () => (groupsQuery.items ?? []).map((g) => ({ label: g.name, value: g.id })),
    [groupsQuery.items],
  );

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groupsQuery.items ?? []) map.set(g.id, g.name);
    return map;
  }, [groupsQuery.items]);

  const excludeIds = useMemo(() => new Set(sources.map((s) => s.id)), [sources]);

  const applyField = useCallback((key: MergeFieldKey, value: CustomerFormData[MergeFieldKey]) => {
    setResults((prev) => ({ ...prev, [key]: value }));
    setSelectedFields((prev) => new Set(prev).add(key));
  }, []);

  const applySection = useCallback((sectionId: SectionId, sourceData: CustomerFormData) => {
    const keys = SECTION_FIELD_KEYS[sectionId];
    const patch: Partial<CustomerFormData> = {};
    for (const key of keys) {
      (patch as Record<string, unknown>)[key] = sourceData[key];
    }
    setResults((prev) => ({ ...prev, ...patch }));
    setSelectedFields((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.add(key);
      return next;
    });
  }, []);

  async function addCustomer(item: CustomerListItem) {
    try {
      const detail = await api.get<ApiCustomer>(`/api/customers/${item.id}`);
      const data = apiToFormData(detail, item.customerGroupName);
      const label = buildLabel(data.firstName, data.lastName, data.company, detail.name);
      setSources((prev) => [...prev, { id: String(item.id), data, label }]);
      if (sources.length === 0) {
        setResults(data);
        setSelectedFields(new Set(Object.keys(data) as MergeFieldKey[]));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer");
    }
  }

  function removeSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  function updateResult(key: MergeFieldKey, value: CustomerFormData[MergeFieldKey]) {
    setResults((prev) => ({ ...prev, [key]: value }));
    setSelectedFields((prev) => new Set(prev).add(key));
  }

  async function completeMerge() {
    if (sources.length < 2) {
      setError("Add at least two customers to merge.");
      return;
    }
    if (!results.firstName.trim()) {
      setError("First name is required in the merged result.");
      return;
    }

    const targetId = sources[0].id;
    const sourceIds = sources.slice(1).map((s) => s.id);

    setBusy(true);
    setError(null);
    try {
      const primaryEmail = results.emails.map((e) => e.trim()).find(Boolean);
      const body: Record<string, unknown> = {
        firstName: results.firstName.trim(),
        name: buildLabel(results.firstName, results.lastName, results.company),
      };
      if (results.lastName.trim()) body.lastName = results.lastName.trim();
      if (results.company.trim()) body.company = results.company.trim();
      if (results.code.trim()) body.code = results.code.trim();
      if (results.customerGroupId) body.customerGroupId = results.customerGroupId;
      if (primaryEmail) body.email = primaryEmail;
      if (results.phone.trim()) body.phone = results.phone.trim();
      if (results.mobile.trim()) body.mobile = results.mobile.trim();

      await api.put(`/api/customers/${targetId}`, body);
      await api.put(`/api/customers/${targetId}/merge`, { sourceIds });
      router.push("/customers");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--oh-border)] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/customers")}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-border)] text-[var(--oh-muted)] transition-colors hover:border-[var(--oh-border-strong)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
            aria-label="Back to customers"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--oh-radius)] bg-[var(--oh-orange-light)] text-[var(--oh-orange)]">
                <MergeIcon size={20} />
              </div>
              <div>
                <h1 className="text-[24px] font-bold tracking-tight text-[var(--oh-text)]">Customer Merge</h1>
                <p className="mt-0.5 text-[14px] text-[var(--oh-muted)]">
                  Add customers, pick the best fields, then merge into one record.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-2 text-[13px] text-[var(--oh-text-secondary)]">
              <UsersIcon size={14} className="mr-1.5 inline" />
              <span className="font-semibold text-[var(--oh-text)]">{sources.length}</span> customer
              {sources.length === 1 ? "" : "s"} added
            </div>
            {sources.length > 0 && sources.length < 2 && (
              <span className="rounded-full bg-[var(--oh-tile-orange-bg)] px-3 py-1.5 text-[13px] font-medium text-[var(--oh-tile-orange-text)]">
                Add 1 more to merge
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 pt-4">
        <AsyncDependencyNotice
          dependencies={[{ label: "Customer groups", error: groupsQuery.error, onRetry: groupsQuery.reload }]}
        />
      </div>

      {/* Workspace — fixed-width columns with horizontal scroll when needed */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="grid h-full min-h-0 gap-4 p-4 md:p-5"
          style={{
            gridTemplateColumns: `${MERGE_COLUMN_WIDTH_PX}px repeat(${sources.length}, ${MERGE_COLUMN_WIDTH_PX}px) ${MERGE_ADD_COLUMN_WIDTH_PX}px`,
            width: "max-content",
            minWidth: "100%",
          }}
        >
        {/* Results column — sticky on horizontal scroll */}
        <div
          className="sticky left-4 z-20 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card),4px_0_16px_rgba(28,37,54,0.08)] md:left-5"
          style={{ width: MERGE_COLUMN_WIDTH_PX }}
        >
          <div className="shrink-0 border-b border-[var(--oh-tile-green-border)] bg-[var(--oh-tile-green-bg)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--oh-tile-green-text)] text-[13px] font-bold text-white">
                ✓
              </span>
              <div>
                <p className="text-[14px] font-semibold text-[var(--oh-tile-green-text)]">Merged Result</p>
                <p className="text-[13px] text-[var(--oh-text-secondary)]">Edit or confirm final values</p>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {sources.length === 0 && (
              <div className="rounded-[var(--oh-radius)] border border-dashed border-[var(--oh-border-strong)] bg-[var(--oh-surface)] px-4 py-6 text-center">
                <UserIcon size={28} className="mx-auto text-[var(--oh-muted)]" strokeWidth={1.5} />
                <p className="mt-3 text-[14px] font-medium text-[var(--oh-text)]">No customers yet</p>
                <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
                  Add customers on the right, then click checkmarks to fill this panel.
                </p>
              </div>
            )}
            {MERGE_SECTIONS.map((section) => (
              <MergeSection
                key={section.id}
                section={section}
                data={results}
                groupLabel={groupNameById.get(results.customerGroupId)}
                selectedFields={selectedFields}
                onChange={updateResult}
                groupOptions={groupOptions}
              />
            ))}
          </div>
        </div>

        {sources.map((source, index) => (
          <div
            key={source.id}
            className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]"
          >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--oh-primary)] text-[13px] font-bold text-white">
                    {customerInitials(source.label)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[var(--oh-text)]">{source.label}</p>
                    {index === 0 ? (
                      <span className="mt-0.5 inline-flex rounded-full bg-[var(--oh-orange-light)] px-2 py-0.5 text-[13px] font-semibold text-[var(--oh-orange)]">
                        Primary · kept after merge
                      </span>
                    ) : (
                      <span className="mt-0.5 inline-flex rounded-full bg-[var(--oh-surface)] px-2 py-0.5 text-[13px] font-medium text-[var(--oh-muted)]">
                        Will be merged in
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--oh-radius)] text-[var(--oh-muted)] outline-none transition-colors hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                  aria-label="Remove customer"
                >
                  <XIcon size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {MERGE_SECTIONS.map((section) => (
                  <MergeSection
                    key={section.id}
                    section={section}
                    data={source.data}
                    groupLabel={groupNameById.get(source.data.customerGroupId)}
                    selectedFields={selectedFields}
                    onSelectField={(key) => applyField(key, source.data[key])}
                    onSelectSection={() => applySection(section.id, source.data)}
                    readOnly
                    groupOptions={groupOptions}
                  />
                ))}
              </div>
            </div>
        ))}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="group flex min-h-0 shrink-0 flex-col items-center justify-center self-stretch rounded-[var(--oh-radius)] border-2 border-dashed border-[var(--oh-border-strong)] bg-white/80 p-6 text-center transition-all hover:border-[var(--oh-orange)] hover:bg-[var(--oh-orange-light)]/30 hover:shadow-[var(--oh-shadow-card)] md:p-10"
        >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-orange)] transition-transform group-hover:scale-105">
              <PlusIcon size={28} strokeWidth={2} />
            </span>
            <span className="mt-5 text-[16px] font-semibold text-[var(--oh-text)]">Add customer to merge</span>
            <span className="mt-2 max-w-[240px] text-[13px] leading-relaxed text-[var(--oh-muted)]">
              Search and select a customer. Use the checkmarks to copy their details into the merged result.
            </span>
            <span className="mt-5 rounded-[var(--oh-radius)] border border-[var(--oh-orange)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--oh-orange)] transition-colors group-hover:bg-[var(--oh-primary)] group-hover:text-white">
            Choose customer
          </span>
        </button>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--oh-border)] bg-white px-6 py-4 shadow-[0_-4px_16px_rgba(28,37,54,0.04)]">
        {error && (
          <div role="alert" aria-live="assertive" className="mb-3 rounded-[var(--oh-radius)] border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-2.5 text-[13px] text-[var(--oh-danger)]">
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13px] text-[var(--oh-muted)]">
            {sources.length < 2
              ? "You need at least two customers before completing the merge."
              : `Merging ${sources.length - 1} customer${sources.length - 1 === 1 ? "" : "s"} into ${sources[0]?.label}.`}
          </p>
          <div className="flex items-center gap-3">
            <AdminSecondaryButton onClick={() => router.push("/customers")}>Cancel</AdminSecondaryButton>
            <AdminPrimaryButton
              onClick={completeMerge}
              disabled={busy || sources.length < 2}
              className="min-w-[180px] justify-center px-6"
            >
              <MergeIcon size={16} />
              {busy ? "Merging…" : "Complete Merge"}
            </AdminPrimaryButton>
          </div>
        </div>
      </div>

      <CustomerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addCustomer}
        excludeIds={excludeIds}
      />
    </div>
  );
}
