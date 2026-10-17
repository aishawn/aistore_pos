import { SearchIcon } from "@/components/icons";

/** Centered "no results" message used across admin list pages. */
export function EmptyState({ message = "No results found. Try changing the search filters" }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center text-base text-neutral-500 md:flex-row md:text-[20px]">
      <SearchIcon size={22} />
      {message}
    </div>
  );
}
