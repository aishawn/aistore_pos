"use client";

import { FormDatePicker } from "@/components/admin/FormDatePicker";

export function FilterDatePicker({
  label,
  value,
  onChange,
  placeholder = "Today",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col font-sans">
      <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">{label}</span>
      <FormDatePicker
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={label}
        compact
        showTodayWhenToday
      />
    </div>
  );
}
