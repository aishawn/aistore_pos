"use client";

import { useRef, type KeyboardEvent } from "react";
import { activateSaleKey, isSaleKeyDisabled, saleKeyLabel, type SaleKeyHandler } from "@/lib/sale-key-actions";
import { getSaleKeysGridExtent } from "@/lib/sale-keys-data";
import type { SaleKey } from "@/types/orithos";
import { cn } from "@/lib/utils";

interface SaleKeySellGridProps {
  keys: SaleKey[];
  cartEmpty: boolean;
  sell: SaleKeyHandler;
  className?: string;
}

function SaleKeyTile({
  keyData,
  bounds,
  disabled,
  tabIndex,
  buttonRef,
  onActivate,
  onKeyDown,
}: {
  keyData: SaleKey;
  bounds: ReturnType<typeof getSaleKeysGridExtent>;
  disabled: boolean;
  tabIndex: number;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const label = saleKeyLabel(keyData);
  const large = keyData.colSpan >= 2 || keyData.rowSpan >= 2;

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled}
      tabIndex={disabled ? -1 : tabIndex}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      style={{
        gridColumn: `${keyData.colStart - bounds.minCol + 1} / span ${keyData.colSpan}`,
        gridRow: `${keyData.rowStart - bounds.minRow + 1} / span ${keyData.rowSpan}`,
        backgroundColor: keyData.bg,
        color: keyData.textColor ?? "#1a1a1a",
      }}
      className={cn(
        "group relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-black/[0.06] px-5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all",
        "hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(0,0,0,0.09)] active:translate-y-0",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0",
        large ? "gap-0.5" : "gap-0",
      )}
    >
      {keyData.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={keyData.image}
          alt={label}
          className={cn(
            "max-h-full max-w-full object-contain drop-shadow-sm transition-transform group-hover:scale-[1.02]",
            large ? "h-[70%] w-auto" : "h-[68%] w-auto",
          )}
        />
      ) : (
        <span
          className={cn(
            "w-full text-center font-semibold leading-tight tracking-tight",
            large ? "text-[11px] sm:text-[12px]" : "text-[10px] sm:text-[11px]",
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
}

/** Each grid unit on the Sell page — 1×1 key = one cell of this size. */
const CELL_PX = 104;
const GRID_GAP_PX = 8;

/** Configured sale-key pad for the Sell workspace — keeps grid layout, styled for the admin UI. */
function neighborIndex(keys: SaleKey[], index: number, dx: number, dy: number, cartEmpty: boolean) {
  const current = keys[index];
  if (!current) return index;
  let best = -1;
  let bestDist = Infinity;
  keys.forEach((key, i) => {
    if (i === index || isSaleKeyDisabled(key.id, cartEmpty)) return;
    const ox = key.colStart - current.colStart;
    const oy = key.rowStart - current.rowStart;
    if (dx !== 0 && Math.sign(ox) !== dx) return;
    if (dy !== 0 && Math.sign(oy) !== dy) return;
    if (dx !== 0 && Math.abs(oy) > Math.abs(ox)) return;
    if (dy !== 0 && Math.abs(ox) > Math.abs(oy)) return;
    const dist = Math.abs(ox) + Math.abs(oy);
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best === -1 ? index : best;
}

export function SaleKeySellGrid({ keys, cartEmpty, sell, className }: SaleKeySellGridProps) {
  const bounds = getSaleKeysGridExtent(keys);
  const gridWidth = bounds.cols * CELL_PX + (bounds.cols - 1) * GRID_GAP_PX;
  const gridHeight = bounds.rows * CELL_PX + (bounds.rows - 1) * GRID_GAP_PX;
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function move(dx: number, dy: number, index: number) {
    const next = neighborIndex(keys, index, dx, dy, cartEmpty);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1, 0, index);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1, 0, index);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(0, 1, index);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(0, -1, index);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const keyData = keys[index];
      if (keyData) activateSaleKey(keyData, sell, cartEmpty);
    }
  }

  return (
    <div className={cn("w-fit p-1", className)} aria-label="Product shortcuts">
      <div
        className="grid"
        style={{
          width: gridWidth,
          height: gridHeight,
          gap: GRID_GAP_PX,
          gridTemplateColumns: `repeat(${bounds.cols}, ${CELL_PX}px)`,
          gridTemplateRows: `repeat(${bounds.rows}, ${CELL_PX}px)`,
        }}
      >
        {keys.map((keyData, index) => (
          <SaleKeyTile
            key={keyData.id}
            keyData={keyData}
            bounds={bounds}
            disabled={isSaleKeyDisabled(keyData.id, cartEmpty)}
            tabIndex={0}
            buttonRef={(node) => {
              buttons.current[index] = node;
            }}
            onActivate={() => {
              activateSaleKey(keyData, sell, cartEmpty);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        ))}
      </div>
    </div>
  );
}
