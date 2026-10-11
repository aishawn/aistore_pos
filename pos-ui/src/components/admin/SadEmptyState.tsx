import { FrownIcon } from "@/components/icons";

/** Large sad-face empty state with a witty per-page message. */
export function SadEmptyState({ title = "No Results Found", message }: { title?: string; message: string }) {
  return (
    <div className="mt-12 flex items-center justify-center gap-10">
      <FrownIcon size={160} strokeWidth={1.5} className="text-black" />
      <div>
        <h2 className="text-[28px] font-bold text-black">{title}</h2>
        <p className="mt-2 text-[18px] text-black">{message}</p>
      </div>
    </div>
  );
}
