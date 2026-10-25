"use client";

import { SelectChevronIcon } from "@/components/icons";

export interface SelectOption {
  label: string;
  value: string;
}

/** Remove duplicate options by value. Skips empty value/label. */
export function uniqueSelectOptions(options: SelectOption[]): SelectOption[] {
  const seenValues = new Set<string>();
  const result: SelectOption[] = [];
  for (const o of options) {
    const value = String(o.value ?? "").trim();
    const label = String(o.label ?? "").trim();
    if (!value || value === "null" || value === "undefined") continue;
    if (!label) continue;
    if (seenValues.has(value)) continue;
    seenValues.add(value);
    result.push({ label, value });
  }
  return result;
}

/**
 * Labeled dropdown for admin filter rows. If `options` is provided it renders a
 * real <select> wired to `value`/`onChange` (server-side filtering); otherwise
 * it falls back to the static "Select…" placeholder used during the visual clone.
 */
export function FilterSelect({
  label,
  placeholder = "Select...",
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  options?: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (options && onChange) {
    const uniqueOptions = uniqueSelectOptions(options);
    return (
      <label className="flex min-w-0 w-full flex-col font-sans">
        {label ? (
          <span className="mb-1 block h-4 truncate whitespace-nowrap text-[13px] font-medium leading-4 text-[var(--oh-text-secondary)]">{label}</span>
        ) : null}
        <div className="relative">
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
className="min-h-11 w-full appearance-none rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2.5 pr-8 text-[13px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]"
          >
            <option value="">{placeholder}</option>
            {uniqueOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
<SelectChevronIcon size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
        </div>
      </label>
    );
  }

  return (
    <label className="flex min-w-0 w-full flex-col font-sans">
      {label ? (
        <span className="mb-1 block h-4 truncate whitespace-nowrap text-[13px] font-medium leading-4 text-[var(--oh-text-secondary)]">{label}</span>
      ) : null}
<span className="flex min-h-11 items-center justify-between rounded-md border border-[var(--oh-border)] px-2.5 text-[13px] text-[var(--oh-muted)]">
        {placeholder}
<SelectChevronIcon size={14} className="text-[var(--oh-muted)]" />
      </span>
    </label>
  );
}
