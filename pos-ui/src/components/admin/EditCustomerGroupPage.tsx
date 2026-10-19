"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { AsyncDependencyNotice, AsyncState } from "@/components/admin/AsyncState";
import {
  AdminPrimaryButton,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import {
  ArrowLeftIcon,
  AwardIcon,
  DollarIcon,
  PlusIcon,
  ReceiptIcon,
  ScaleIcon,
  SelectChevronIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface Named {
  id: string;
  name: string;
}

export interface CustomerGroupDetail {
  id: string;
  name: string;
  defaultReceiptId?: string | number | null;
  emailReceiptId?: string | number | null;
  paymentReceiptId?: string | number | null;
  statementTemplateId?: string | number | null;
  priceListId?: string | number | null;
  loyaltyEnabled?: boolean;
  disablePromotions?: boolean;
  allowAccountSales?: boolean;
  accountLimit?: number | null;
  autoPrintReceipt?: boolean;
  autoPrintParkedReceipt?: boolean;
  autoEmailReceipt?: boolean;
  autoPrintPaymentReceipt?: boolean;
  requireOrderReference?: boolean;
  creditTerms?: string | null;
}

type TabId = "general" | "receipts" | "account-sales";

const TABS: { id: TabId; label: string; Icon: typeof UserIcon }[] = [
  { id: "general", label: "General", Icon: UserIcon },
  { id: "receipts", label: "Receipts", Icon: ReceiptIcon },
  { id: "account-sales", label: "Account Sales", Icon: ScaleIcon },
];

const inputClass =
  "h-10 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-60";

const selectTriggerClass =
  "flex h-10 w-full items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-60";

const ISO8601_DURATION =
  /^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/;

function isValidIso8601Duration(value: string): boolean {
  if (!ISO8601_DURATION.test(value)) return false;
  return /(\d+[YMDW]|T\d+[HMS]|\d+H|\d+M|\d+S)/.test(value.slice(1));
}

function strId(v?: string | number | null) {
  return v === null || v === undefined ? "" : String(v);
}

function parseCreditTerms(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function joinCreditTerms(terms: string[]): string | null {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(",") : null;
}

function FormField({
  label,
  help,
  children,
}: {
  label: string;
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--oh-border)] py-5 last:border-b-0">
      <div className="text-[14px] font-semibold text-[var(--oh-text)]">{label}</div>
      {help && <p className="mt-1 text-[13px] leading-relaxed text-[var(--oh-muted)]">{help}</p>}
      <div className="mt-3 max-w-2xl">{children}</div>
    </div>
  );
}

function FormSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={selectTriggerClass}
      >
        <span className={selected ? "text-[var(--oh-text)]" : "text-[var(--oh-placeholder)]"}>
          {selected?.label ?? placeholder}
        </span>
        <SelectChevronIcon
          size={16}
          className={cn("text-[var(--oh-muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="absolute z-[200] mt-1 max-h-56 w-full overflow-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white py-1 shadow-[var(--oh-shadow-card)]">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex w-full px-3 py-2 text-left text-[14px] text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"
            >
              {placeholder}
            </button>
          </li>
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
                  o.value === value ? "bg-[var(--oh-orange-light)]/40 font-medium" : "",
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Toggle customer group status"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      className={cn(
        "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  onText,
  offText,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  onText: string;
  offText: string;
  disabled?: boolean;
}) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-3">
        <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
        <span className="text-[14px] text-[var(--oh-muted)]">{checked ? onText : offText}</span>
      </div>
    </FormField>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof UserIcon; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--oh-border)] py-4">
      <Icon size={18} className="text-[var(--oh-orange)]" strokeWidth={1.75} />
      <h2 className="text-[16px] font-semibold text-[var(--oh-text)]">{title}</h2>
    </div>
  );
}

function toOptions(rows?: Named[] | null) {
  return (rows ?? []).map((r) => ({ label: r.name, value: r.id }));
}

function groupToForm(g: CustomerGroupDetail): CustomerGroupDetail {
  return {
    id: String(g.id),
    name: g.name ?? "",
    defaultReceiptId: strId(g.defaultReceiptId),
    emailReceiptId: strId(g.emailReceiptId),
    paymentReceiptId: strId(g.paymentReceiptId),
    statementTemplateId: strId(g.statementTemplateId),
    priceListId: strId(g.priceListId),
    loyaltyEnabled: g.loyaltyEnabled ?? false,
    disablePromotions: g.disablePromotions ?? false,
    allowAccountSales: g.allowAccountSales ?? false,
    accountLimit: g.accountLimit ?? null,
    autoPrintReceipt: g.autoPrintReceipt ?? false,
    autoPrintParkedReceipt: g.autoPrintParkedReceipt ?? false,
    autoEmailReceipt: g.autoEmailReceipt ?? false,
    autoPrintPaymentReceipt: g.autoPrintPaymentReceipt ?? false,
    requireOrderReference: g.requireOrderReference ?? false,
    creditTerms: g.creditTerms ?? null,
  };
}

function formToBody(form: CustomerGroupDetail) {
  return {
    name: form.name.trim(),
    defaultReceiptId: form.defaultReceiptId || null,
    emailReceiptId: form.emailReceiptId || null,
    paymentReceiptId: form.paymentReceiptId || null,
    statementTemplateId: form.statementTemplateId || null,
    priceListId: form.priceListId || null,
    loyaltyEnabled: form.loyaltyEnabled ?? false,
    disablePromotions: form.disablePromotions ?? false,
    allowAccountSales: form.allowAccountSales ?? false,
    accountLimit: form.accountLimit,
    autoPrintReceipt: form.autoPrintReceipt ?? false,
    autoPrintParkedReceipt: form.autoPrintParkedReceipt ?? false,
    autoEmailReceipt: form.autoEmailReceipt ?? false,
    autoPrintPaymentReceipt: form.autoPrintPaymentReceipt ?? false,
    requireOrderReference: form.requireOrderReference ?? false,
    creditTerms: form.creditTerms,
  };
}

/** Full-page customer group edit form with General, Receipts and Account Sales tabs. */
export function EditCustomerGroupPage({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("general");
  const [form, setForm] = useState<CustomerGroupDetail | null>(null);
  const [creditTermRows, setCreditTermRows] = useState<string[]>([]);
  const [creditTermError, setCreditTermError] = useState<string | null>(null);
  const [accountLimitText, setAccountLimitText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const { data: group, loading, error, reload } = useApi<CustomerGroupDetail>(
    groupId ? `/api/customers/groups/${groupId}` : null,
  );

  const priceLists = useApiList<Named>("/api/price-lists", { page: 1, size: DROPDOWN_PAGE_SIZE });
  const receipts = useApi<Named[]>("/api/receipts");
  const statements = useApi<Named[]>("/api/statements");

  useEffect(() => {
    if (!group) return;
    const next = groupToForm(group);
    setForm(next);
    const terms = parseCreditTerms(next.creditTerms);
    setCreditTermRows(terms.length > 0 ? terms : [""]);
    setAccountLimitText(next.accountLimit != null ? String(next.accountLimit) : "");
  }, [group]);

  if (!form && !loading && !error) return null;

  const set = (patch: Partial<CustomerGroupDetail>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function collectCreditTerms(): string[] | null {
    const terms = creditTermRows.map((t) => t.trim()).filter(Boolean);
    for (const term of terms) {
      if (!isValidIso8601Duration(term)) {
        setCreditTermError(
          "Credit terms must use ISO 8601 duration format, for example P7D or P30D.",
        );
        return null;
      }
    }
    const normalized = terms.map((t) => t.toUpperCase());
    if (new Set(normalized).size !== normalized.length) {
      setCreditTermError("Duplicate credit terms are not allowed.");
      return null;
    }
    setCreditTermError(null);
    return terms;
  }

  async function save() {
    if (!form) return;
    const terms = collectCreditTerms();
    if (terms === null) return;

    setBusy(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const limit =
        accountLimitText.trim() === "" ? null : Number.parseFloat(accountLimitText.replace(/[$,]/g, ""));
      const body = formToBody({
        ...form,
        accountLimit: Number.isFinite(limit) ? limit : null,
        creditTerms: joinCreditTerms(terms),
      });
      await api.put(`/api/customers/groups/${groupId}`, body);
      setSaveOk(true);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save customer group");
    } finally {
      setBusy(false);
    }
  }

  function updateCreditTermRow(index: number, value: string) {
    setCreditTermRows((prev) => prev.map((term, i) => (i === index ? value : term)));
    if (creditTermError) setCreditTermError(null);
  }

  function removeCreditTermRow(index: number) {
    setCreditTermRows((prev) => prev.filter((_, i) => i !== index));
    if (creditTermError) setCreditTermError(null);
  }

  function addCreditTermRow() {
    setCreditTermRows((prev) => [...prev, ""]);
    setCreditTermError(null);
  }

  const groupName = form?.name?.trim() || "Customer Group";
  const accountSalesEnabled = form?.allowAccountSales ?? false;

  return (
    <div className="h-full overflow-auto bg-[var(--oh-surface)] p-5 font-sans md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/customer-groups")}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--oh-muted)] hover:text-[var(--oh-text)]"
        >
          <ArrowLeftIcon size={16} />
          Back to Customer Groups
        </button>
      </div>

      <h1 className="text-[20px] font-semibold text-[var(--oh-text)] md:text-[22px]">
        Editing <span className="text-[var(--oh-orange)]">{groupName}</span>
      </h1>

      <div className="mx-auto mt-5 max-w-5xl">
        <div className="flex flex-wrap gap-1 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white/60 p-1 shadow-[var(--oh-shadow-card)]">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-white text-[var(--oh-text)] shadow-sm"
                    : "text-[var(--oh-muted)] hover:bg-white/80 hover:text-[var(--oh-text-secondary)]",
                )}
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
                  { label: "Price lists", error: priceLists.error, loading: priceLists.loading, onRetry: priceLists.reload },
                  { label: "Receipt templates", error: receipts.error, loading: receipts.loading, onRetry: receipts.reload },
                  { label: "Statement templates", error: statements.error, loading: statements.loading, onRetry: statements.reload },
                ]}
              />
              {tab === "general" && (
                <>
                  <SectionHeading icon={UserIcon} title="General" />
                  <FormField
                    label="Name"
                    help="The name of the Customer Group"
                  >
                    <input
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                      className={inputClass}
                    />
                  </FormField>

                  <SectionHeading icon={AwardIcon} title="Loyalty" />
                  <ToggleField
                    label="Loyalty Enabled"
                    checked={form.loyaltyEnabled ?? false}
                    onChange={(v) => set({ loyaltyEnabled: v })}
                    onText="Loyalty is enabled"
                    offText="Loyalty is disabled"
                  />

                  <SectionHeading icon={DollarIcon} title="Special Pricing" />
                  <ToggleField
                    label="Disable Promotions"
                    checked={form.disablePromotions ?? false}
                    onChange={(v) => set({ disablePromotions: v })}
                    onText="Cannot receive promotional pricing"
                    offText="Can receive promotional pricing"
                  />
                  <FormField
                    label="Price List"
                    help="The custom pricing that applies to customers in this group"
                  >
                    <FormSelect
                      value={strId(form.priceListId)}
                      options={toOptions(priceLists.items)}
                      onChange={(priceListId) => set({ priceListId })}
                      placeholder="Select Price List…"
                    />
                  </FormField>
                </>
              )}

              {tab === "receipts" && (
                <>
                  <SectionHeading icon={ReceiptIcon} title="Receipts" />
                  <FormField
                    label="Default Receipt"
                    help="The receipt that should be printed instead of the register's default receipt"
                  >
                    <FormSelect
                      value={strId(form.defaultReceiptId)}
                      options={toOptions(receipts.data)}
                      onChange={(defaultReceiptId) => set({ defaultReceiptId })}
                      placeholder="Select Default Receipt…"
                    />
                  </FormField>
                  <FormField
                    label="Email Receipt"
                    help="The email receipt that should be sent instead of the register's default template"
                  >
                    <FormSelect
                      value={strId(form.emailReceiptId)}
                      options={toOptions(receipts.data)}
                      onChange={(emailReceiptId) => set({ emailReceiptId })}
                      placeholder="Select Email Receipt…"
                    />
                  </FormField>
                  <ToggleField
                    label="Auto Print Receipt"
                    checked={form.autoPrintReceipt ?? false}
                    onChange={(v) => set({ autoPrintReceipt: v })}
                    onText="Receipts will be printed automatically"
                    offText="Receipts will be printed based on the register settings"
                  />
                  <ToggleField
                    label="Auto Print Parked Receipt"
                    checked={form.autoPrintParkedReceipt ?? false}
                    onChange={(v) => set({ autoPrintParkedReceipt: v })}
                    onText="Parked sale receipts will be printed automatically"
                    offText="Parked sale receipts will be printed based on the register settings"
                  />
                  <ToggleField
                    label="Auto Email Receipt"
                    checked={form.autoEmailReceipt ?? false}
                    onChange={(v) => set({ autoEmailReceipt: v })}
                    onText="Receipts will be automatically emailed"
                    offText="Receipts will not be automatically emailed"
                  />
                </>
              )}

              {tab === "account-sales" && (
                <>
                  <SectionHeading icon={ScaleIcon} title="Account Sales" />
                  <ToggleField
                    label="Allow Account Sales"
                    checked={form.allowAccountSales ?? false}
                    onChange={(v) => set({ allowAccountSales: v })}
                    onText="Customers can pay for goods later"
                    offText="Customers cannot pay for goods later"
                  />
                  <FormField
                    label="Account Limit"
                    help="The maximum amount of money customers in this group can owe, attempting to pay later for goods that would cause their current balance to exceed this amount will be prevented"
                  >
                    <div className="relative max-w-md">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--oh-muted)]">
                        $
                      </span>
                      <input
                        value={accountLimitText}
                        onChange={(e) => setAccountLimitText(e.target.value)}
                        placeholder="Unlimited"
                        disabled={!accountSalesEnabled}
                        className={cn(inputClass, "pl-7")}
                      />
                    </div>
                  </FormField>
                  <FormField
                    label="Payment Receipt"
                    help="The payment receipt template to use when paying off a customer's account"
                  >
                    <FormSelect
                      value={strId(form.paymentReceiptId)}
                      options={toOptions(receipts.data)}
                      onChange={(paymentReceiptId) => set({ paymentReceiptId })}
                      placeholder="Select Payment Receipt…"
                      disabled={!accountSalesEnabled}
                    />
                  </FormField>
                  <FormField
                    label="Statement Template"
                    help="The statement template to use to send to show customers their account activity"
                  >
                    <FormSelect
                      value={strId(form.statementTemplateId)}
                      options={toOptions(statements.data)}
                      onChange={(statementTemplateId) => set({ statementTemplateId })}
                      placeholder="Select Statement Template…"
                      disabled={!accountSalesEnabled}
                    />
                  </FormField>
                  <ToggleField
                    label="Auto Print Payment Receipt"
                    checked={form.autoPrintPaymentReceipt ?? false}
                    onChange={(v) => set({ autoPrintPaymentReceipt: v })}
                    onText="Payment receipts are automatically printed"
                    offText="Payment receipts are not automatically printed"
                    disabled={!accountSalesEnabled}
                  />
                  <ToggleField
                    label="Require Order Reference"
                    checked={form.requireOrderReference ?? false}
                    onChange={(v) => set({ requireOrderReference: v })}
                    onText="Customers require an order reference"
                    offText="Customers don't require an order reference"
                    disabled={!accountSalesEnabled}
                  />
                  <FormField
                    label="Credit Terms"
                    help={
                      <>
                        Specifies the time periods displayed with the amount of money owing during each period
                        (e.g. 7 days, 30 days). It must be formatted as an{" "}
                        <a
                          href="https://en.wikipedia.org/wiki/ISO_8601#Durations"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--oh-info)] underline"
                        >
                          ISO 8601 duration
                        </a>
                        .
                      </>
                    }
                  >
                    {creditTermRows.length > 0 && (
                      <ul className="mb-3 space-y-2">
                        {creditTermRows.map((term, i) => (
                          <li key={`credit-term-${i}`} className="relative">
                            <input
                              value={term}
                              onChange={(e) => updateCreditTermRow(i, e.target.value)}
                              placeholder="e.g. P30D"
                              className={cn(inputClass, "pr-10")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addCreditTermRow();
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeCreditTermRow(i)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
                              aria-label="Remove credit term"
                            >
                              <XIcon size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {creditTermError && (
                      <p className="mb-2 text-[13px] text-[var(--oh-danger)]">{creditTermError}</p>
                    )}
                    <button
                      type="button"
                      onClick={addCreditTermRow}
                      className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border-2 border-[#3cb44b] py-2.5 text-[14px] font-medium text-[#3cb44b] transition-colors hover:bg-[#3cb44b]/5"
                    >
                      <PlusIcon size={16} /> Add Credit Term
                    </button>
                  </FormField>
                </>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-4">
                <div className="text-[13px]">
                  {saveError && <span className="text-[var(--oh-danger)]">{saveError}</span>}
                  {saveOk && !saveError && (
                    <span className="text-[var(--oh-success)]">Changes saved successfully.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <AdminSecondaryButton onClick={() => router.push("/customer-groups")}>
                    Cancel
                  </AdminSecondaryButton>
                  <AdminPrimaryButton onClick={save} disabled={busy}>
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
