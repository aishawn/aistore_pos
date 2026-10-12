"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { CUSTOMER_WIZARD_STORAGE_KEY } from "@/components/admin/CreateCustomerPage";
import { useApiList } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import {
  CUSTOMER_FIELD_LIMITS,
  isPureDigits,
  isValidEmail,
} from "@/lib/customerValidation";
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

export interface CreateCustomerData {
  firstName: string;
  lastName: string;
  customerGroupId: string;
  code: string;
  email: string;
}

const STEPS = 4;
const EMPTY: CreateCustomerData = {
  firstName: "",
  lastName: "",
  customerGroupId: "",
  code: "",
  email: "",
};

const inputClass =
  "mt-4 h-12 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 text-[15px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

const invalidInputClass =
  " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]";

const REQUIRED_EMPTY_MESSAGE = "必填项不能为空";

const selectWrapClass = "relative";
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
  label,
  required = false,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
}: {
  label?: string;
  required?: boolean;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uniqueOptions = uniqueSelectOptions(options);
  const selected = uniqueOptions.find((o) => o.value === value);

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
      {label && <FieldLabel required={required}>{label}</FieldLabel>}
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
                    o.value === value ? "bg-[var(--oh-orange-light)]/40 font-medium text-[var(--oh-text)]" : "text-[var(--oh-text)]"
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

function buildName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function buildWizardSaveBody(form: CreateCustomerData): Record<string, unknown> {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const email = form.email.trim();
  const code = form.code.trim() || `C${Date.now()}`.slice(0, CUSTOMER_FIELD_LIMITS.code);
  return {
    firstName,
    lastName,
    name: buildName(firstName, lastName),
    customerGroupId: form.customerGroupId ? Number(form.customerGroupId) : null,
    code,
    email: email || null,
    emails: email ? [email] : [],
  };
}

function RequiredMark() {
  return <span className="ml-0.5 text-[var(--oh-danger)]">*</span>;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 mt-4 block text-[13px] font-medium text-[var(--oh-text-secondary)] first:mt-0">
      {children}
      {required && <RequiredMark />}
    </span>
  );
}

/**
 * Four-step customer creation wizard. Flow mirrors Shopfront's Create Customer
 * screens; styling matches AdminPageLayout (--oh-* design tokens).
 */
export function CreateCustomerWizard({
  open,
  onClose,
  onCreated,
  groups: groupsProp,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  groups?: Named[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateCustomerData>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState({ firstName: false, lastName: false });

  const groupsQuery = useApiList<Named>(
    open && !groupsProp ? "/api/customers/groups" : null,
    { page: 1, size: DROPDOWN_PAGE_SIZE },
  );
  const groups = groupsProp ?? groupsQuery.items ?? [];

  useEffect(() => {
    if (!open) return;
    const items = groups.filter(
      (g) => g.id != null && String(g.id).trim() !== "" && g.name?.trim(),
    );
    const preferred =
      items.find((g) => g.name.trim().toLowerCase() === "default") ??
      items.find((g) => g.name.trim() === "默认分组") ??
      items[0];
    if (!preferred) return;
    setForm((prev) => {
      if (prev.customerGroupId) return prev;
      return { ...prev, customerGroupId: String(preferred.id) };
    });
  }, [open, groups]);

  if (!open) return null;

  const set = (patch: Partial<CreateCustomerData>) => setForm((f) => ({ ...f, ...patch }));
  const groupOptions = groups
    .filter((g) => g.id != null && String(g.id).trim() !== "" && g.name?.trim())
    .map((g) => ({ label: g.name.trim(), value: String(g.id) }));
  const finishDisabled = busy;

  function resetAndClose() {
    setStep(0);
    setForm(EMPTY);
    setError(null);
    setInvalidFields({ firstName: false, lastName: false });
    onClose();
  }

  function validateNameStep(): boolean {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) {
      setInvalidFields({ firstName: !firstName, lastName: !lastName });
      setError(REQUIRED_EMPTY_MESSAGE);
      return false;
    }
    if (firstName.length > CUSTOMER_FIELD_LIMITS.firstName) {
      setInvalidFields({ firstName: true, lastName: false });
      setError(`First name must be at most ${CUSTOMER_FIELD_LIMITS.firstName} characters.`);
      return false;
    }
    if (isPureDigits(firstName)) {
      setInvalidFields({ firstName: true, lastName: false });
      setError("First name cannot be numbers only.");
      return false;
    }
    if (lastName.length > CUSTOMER_FIELD_LIMITS.lastName) {
      setInvalidFields({ firstName: false, lastName: true });
      setError(`Last name must be at most ${CUSTOMER_FIELD_LIMITS.lastName} characters.`);
      return false;
    }
    if (isPureDigits(lastName)) {
      setInvalidFields({ firstName: false, lastName: true });
      setError("Last name cannot be numbers only.");
      return false;
    }
    setInvalidFields({ firstName: false, lastName: false });
    return true;
  }

  function validateGroupStep(): boolean {
    // Prefer default group; empty is allowed — backend assigns the default group.
    return true;
  }

  function validateCodeStep(): boolean {
    const code = form.code.trim();
    if (code.length > CUSTOMER_FIELD_LIMITS.code) {
      setError(`Code must be at most ${CUSTOMER_FIELD_LIMITS.code} characters.`);
      return false;
    }
    return true;
  }

  function validateEmailStep(): boolean {
    if (form.email.trim() && !isValidEmail(form.email)) {
      setError("Email format is invalid.");
      return false;
    }
    return true;
  }

  function ensureCode(): string {
    const existing = form.code.trim();
    if (existing) return existing;
    const generated = `C${Date.now()}`.slice(0, CUSTOMER_FIELD_LIMITS.code);
    set({ code: generated });
    return generated;
  }

  function goNext() {
    if (step === 0 && !validateNameStep()) return;
    if (step === 1 && !validateGroupStep()) return;
    if (step === 2) {
      if (!form.code.trim()) ensureCode();
      if (!validateCodeStep()) return;
    }
    setError(null);
    if (step < STEPS - 1) setStep((s) => s + 1);
  }

  function goPrev() {
    setError(null);
    setInvalidFields({ firstName: false, lastName: false });
    if (step > 0) setStep((s) => s - 1);
  }

  function onWizardKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || busy || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "TEXTAREA") return;
    e.preventDefault();
    if (step < STEPS - 1) goNext();
    else void finish();
  }

  function skipToFullForm() {
    sessionStorage.setItem(CUSTOMER_WIZARD_STORAGE_KEY, JSON.stringify(form));
    resetAndClose();
    router.push("/customers/new");
  }

  async function finish() {
    const stepValidators = [
      validateNameStep,
      validateGroupStep,
      validateCodeStep,
      validateEmailStep,
    ];
    for (let i = 0; i < stepValidators.length; i++) {
      if (!stepValidators[i]()) {
        setStep(i);
        return;
      }
    }

    const code = ensureCode();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/customers", buildWizardSaveBody({ ...form, code }));

      resetAndClose();
      onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.code === 40905) {
        setError("A customer with this email already exists.");
      } else if (e instanceof ApiError && e.code === 40904) {
        setError("A customer with this code already exists.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to create customer");
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
          <h2 className="mt-5 text-center text-[22px] font-semibold text-[var(--oh-text)]">Create Customer</h2>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-visible px-8 py-10">
          {step === 0 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What is the customer&apos;s name?
              </p>
              <FieldLabel required>First Name</FieldLabel>
              <input
                autoFocus
                value={form.firstName}
                onChange={(e) => {
                  set({ firstName: e.target.value });
                  if (invalidFields.firstName) {
                    setInvalidFields((fields) => ({ ...fields, firstName: false }));
                  }
                  if (error) setError(null);
                }}
                placeholder="First Name"
                maxLength={CUSTOMER_FIELD_LIMITS.firstName}
                aria-required="true"
                aria-invalid={invalidFields.firstName}
                className={`${inputClass} mt-0${invalidFields.firstName ? invalidInputClass : ""}`}
              />
              <FieldLabel required>Last Name</FieldLabel>
              <input
                value={form.lastName}
                onChange={(e) => {
                  set({ lastName: e.target.value });
                  if (invalidFields.lastName) {
                    setInvalidFields((fields) => ({ ...fields, lastName: false }));
                  }
                  if (error) setError(null);
                }}
                placeholder="Last Name"
                maxLength={CUSTOMER_FIELD_LIMITS.lastName}
                aria-required="true"
                aria-invalid={invalidFields.lastName}
                className={`${inputClass} mt-0${invalidFields.lastName ? invalidInputClass : ""}`}
              />
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                Which group does the customer belong to?
              </p>
              <StepSelect
                label="Customer Group"
                value={form.customerGroupId}
                options={groupOptions}
                onChange={(customerGroupId) => set({ customerGroupId })}
                disabled={groupsQuery.loading}
                placeholder={groupsQuery.loading ? "Loading groups…" : "Select…"}
              />
              {groupsQuery.error && (
                <p className="mt-3 text-[14px] text-[var(--oh-danger)]">Failed to load groups: {groupsQuery.error}</p>
              )}
              {!groupsQuery.loading && !groupsQuery.error && groupOptions.length === 0 && (
                <p className="mt-3 text-[14px] text-[var(--oh-muted)]">
                  No groups yet. Add groups under Customer Groups first.
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What code would you like to allocate to the customer?
              </p>
              <FieldLabel>Code</FieldLabel>
              <input
                autoFocus
                value={form.code}
                onChange={(e) => set({ code: e.target.value })}
                placeholder="Auto-generated if empty"
                maxLength={CUSTOMER_FIELD_LIMITS.code}
                className={`${inputClass} mt-0`}
              />
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-[24px] font-semibold leading-snug text-[var(--oh-text)]">
                What is the customer&apos;s email?
              </p>
              <FieldLabel>Email</FieldLabel>
              <input
                autoFocus
                type="email"
                value={form.email}
                onChange={(e) => {
                  set({ email: e.target.value });
                  if (error) setError(null);
                }}
                placeholder="Email"
                maxLength={CUSTOMER_FIELD_LIMITS.email}
                className={`${inputClass} mt-0${
                  error && step === 3
                    ? " border-[var(--oh-danger)] focus:border-[var(--oh-danger)] focus:ring-[var(--oh-danger)]"
                    : ""
                }`}
              />
            </>
          )}

          {error && (
            <p role="alert" className="mt-6 text-[14px] font-medium text-[var(--oh-danger)]">
              {error}
            </p>
          )}
        </div>

        {/* Footer navigation */}
        <div className="grid grid-cols-3 items-center border-t border-[var(--oh-border)] px-8 py-5">
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
          <div className="text-center">
            <button
              type="button"
              onClick={skipToFullForm}
              disabled={busy}
              className="text-[14px] font-medium text-[var(--oh-muted)] hover:text-[var(--oh-text)] disabled:opacity-50"
            >
              Skip
            </button>
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
