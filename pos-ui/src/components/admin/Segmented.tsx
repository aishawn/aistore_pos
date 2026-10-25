import { cn } from "@/lib/utils";

/** Segmented toggle (blue active, dark inactive) used on the reporting dashboard. */
export function Segmented({ label, options, active = 0 }: { label: string; options: string[]; active?: number }) {
  return (
    <div className="flex flex-col items-center">
<span className="mb-2 text-[18px] text-[var(--oh-text)]">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md">
        {options.map((o, i) => (
          <span
            key={o}
            className={cn(
              "px-6 py-3 text-[16px] font-medium",
i === active ? "bg-[var(--oh-info)] text-[var(--oh-on-inverse)]" : "bg-[var(--oh-surface-muted)] text-[var(--oh-text)]",
            )}
          >
            {o}
          </span>
        ))}
      </div>
    </div>
  );
}
