import { SearchIcon } from "@/components/icons";

/** Centered "no results" message used across admin list pages. */
export function EmptyState({ message = "No results found. Try changing the search filters" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-[20px] text-neutral-500">
      <SearchIcon size={22} />
      {message}
    </div>
  );
}
