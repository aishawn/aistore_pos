"use client";

import { cn } from "@/lib/utils";
import type { SaleKey } from "@/types/orithos";

interface SaleKeyGridProps {
  keys: SaleKey[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}

function SaleKeyTile({
  keyData,
  selected,
  onSelect,
}: {
  keyData: SaleKey;
  selected: boolean;
  onSelect?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      style={{
        gridColumn: `${keyData.colStart} / span ${keyData.colSpan}`,
        gridRow: `${keyData.rowStart} / span ${keyData.rowSpan}`,
      }}
      className={cn(
        "flex cursor-pointer items-center justify-center bg-transparent transition-shadow",
        selected && "ring-2 ring-[var(--sf-tab-blue)] ring-offset-1",
      )}
    >
      {keyData.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={keyData.image} alt={keyData.label ?? keyData.id} className="h-full w-auto object-fill" />
      ) : (
        <span className="px-1 text-center text-[13px] font-medium leading-tight text-black">
          {keyData.label ?? keyData.id}
        </span>
      )}
    </div>
  );
}

/** 10×10 sale-key grid for the settings editor. */
export function SaleKeyGrid({
  keys,
  selectedId,
  onSelect,
  className,
}: SaleKeyGridProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="absolute inset-0 rounded-sm border border-dashed border-neutral-300"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "10% 10%",
        }}
      />
      <div className="absolute inset-0 grid grid-cols-10 grid-rows-10">
        {keys.map((keyData) => (
          <SaleKeyTile
            key={keyData.id}
            keyData={keyData}
            selected={selectedId === keyData.id}
            onSelect={() => onSelect?.(keyData.id)}
          />
        ))}
      </div>
    </div>
  );
}
