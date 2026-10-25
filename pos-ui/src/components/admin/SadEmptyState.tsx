import { FrownIcon } from "@/components/icons";

/** Large sad-face empty state with a witty per-page message. */
export function SadEmptyState({ title = "No Results Found", message }: { title?: string; message: string }) {
  return (
    <div role="status" aria-live="polite" className="mt-12 flex flex-col items-center justify-center gap-5 px-4 text-center md:flex-row md:gap-10 md:text-left">
<FrownIcon size={96} strokeWidth={1.5} className="shrink-0 text-[var(--oh-text-secondary)] md:h-40 md:w-40" />
      <div className="max-w-xl">
<h2 className="text-2xl font-bold text-[var(--oh-text)] md:text-[28px]">{title}</h2>
<p className="mt-2 text-base text-[var(--oh-text-secondary)] md:text-[18px]">{message}</p>
      </div>
    </div>
  );
}
