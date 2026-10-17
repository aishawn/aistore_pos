"use client";

import { FormDateRangePicker } from "@/components/admin/FormDateRangePicker";

export function FilterDateRangePicker({
  label,
  start,
  end,
  onChange,
  placeholder = "DD/MM/YYYY — DD/MM/YYYY",
}: {
  label: string;
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 w-full flex-col font-sans">
      <span className="mb-1 block h-4 truncate whitespace-nowrap text-[13px] font-medium leading-4 text-[var(--oh-text-secondary)]">
        {label}
      </span>
      <FormDateRangePicker
        start={start}
        end={end}
        onChange={onChange}
        placeholder={placeholder}
        ariaLabel={label}
        compact
      />
    </label>
  );
}
