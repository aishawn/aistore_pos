"use client";

import { useRef } from "react";
import { ChevronDown, Trash2, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitMoney, useSellScreen } from "@/lib/sell-screen";

const THUMB_STYLES: Record<string, string> = {
  bananas: "bg-[#fef3c7] text-2xl",
  bread: "bg-[#fde68a] text-xl",
  detergent: "bg-[#dbeafe] text-xl",
  shiraz: "bg-[#fce7f3] text-xl",
  peroni: "bg-[#fef9c3] text-xl",
  vodka: "bg-[#e0e7ff] text-xl",
  cheese: "bg-[#ffedd5] text-xl",
  "craft-beer": "bg-[#fef3c7] text-xl",
};

function productThumb(id: string, name: string) {
  const key = id || name.toLowerCase();
  const emoji =
    key.includes("banana") ? "🍌"
    : key.includes("bread") ? "🍞"
    : key.includes("detergent") ? "🧴"
    : key.includes("shiraz") || key.includes("wine") ? "🍷"
    : key.includes("peroni") || key.includes("beer") || key.includes("lager") ? "🍺"
    : key.includes("vodka") ? "🥃"
    : key.includes("cheese") ? "🧀"
    : "🛒";
  const bg = THUMB_STYLES[id] ?? "bg-[var(--oh-surface)] text-xl";
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", bg)}>
      {emoji}
    </span>
  );
}

/**
 * Live POS Transaction — strict match to Orithos reference mockup.
 */
export function PosTransactionPanel() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { whole, cents } = splitMoney(sell.total);
  const hasItems = sell.lines.length > 0;

  const wetGst = hasItems ? +(sell.total * 0.12).toFixed(2) : 0;
  const gstTax = hasItems ? +(sell.total * 0.1).toFixed(2) : 0;

  function onSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sell.setSearchQuery(value);
      sell.setSearchOpen(!!value.trim());
    }, 250);
  }

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]">
      {/* Header row */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[17px] font-semibold text-[var(--oh-text)]">Live POS Transaction</h1>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]"
          >
            Bottle Shop
            <ChevronDown size={13} className="text-[var(--oh-muted)]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => sell.runAction("Quick Or/Flows")}
            className="cursor-pointer rounded-lg border border-[var(--oh-border)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)]"
          >
            Quick Or/Flows
          </button>
          <button
            type="button"
            onClick={() => sell.setView("customers")}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
          >
            <ScanLine size={15} />
            Scan Customer
          </button>
        </div>
      </div>

      {/* Hidden search (functional, minimal) */}
      <div className="relative shrink-0 border-b border-[var(--oh-border)] px-5 py-2">
        <input
          type="text"
          value={sell.searchQuery}
          aria-label="Scan barcode or search product"
          placeholder="Scan barcode or search product…"
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => sell.setSearchOpen(true)}
          className="h-9 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)]"
        />
        {sell.searchOpen && sell.searchResults && <SearchDropdown />}
      </div>

      {sell.view === "customers" && <CustomerOverlay />}

      {/* Transaction table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-[var(--oh-border)] bg-[var(--oh-surface)] text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
              <th className="px-5 py-3 text-left">Product</th>
              <th className="w-16 px-2 py-3 text-center">Qty</th>
              <th className="w-24 px-2 py-3 text-right">Price</th>
              <th className="w-24 px-2 py-3 text-right">Total</th>
              <th className="w-10 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {sell.lines.map((line) => {
              const lineTotal = splitMoney(line.qty * line.unitPrice);
              const selected = sell.selectedId === line.id;
              return (
                <tr
                  key={line.id}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={() => sell.selectLine(line.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      sell.selectLine(line.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer border-b border-[var(--oh-border)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
                    selected ? "bg-[var(--oh-orange-light)]/40" : "hover:bg-[var(--oh-surface)]/80",
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {productThumb(line.id, line.name)}
                      <span className="font-medium text-[var(--oh-text)]">{line.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3.5 text-center text-[var(--oh-text-secondary)]">{line.qty}</td>
                  <td className="px-2 py-3.5 text-right text-[var(--oh-text-secondary)]">
                    ${line.unitPrice.toFixed(2)}
                  </td>
                  <td className="px-2 py-3.5 text-right font-semibold text-[var(--oh-text)]">
                    ${lineTotal.whole}.{lineTotal.cents}
                  </td>
                  <td className="px-3 py-3.5">
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        sell.removeLine(line.id);
                      }}
                      className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tax summary + grand total (bottom-right, per reference) */}
      <div className="flex shrink-0 flex-wrap items-end justify-end gap-8 border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/60 px-5 py-4">
        <div className="space-y-1 text-right text-[13px] text-[var(--oh-muted)]">
          <p>
            Taxes <span className="text-[var(--oh-text-secondary)]">(WET/GST)</span>
            <span className="ml-4 font-medium text-[var(--oh-text)]">${wetGst.toFixed(2)}</span>
          </p>
          <p>
            GST Taxe
            <span className="ml-4 font-medium text-[var(--oh-text)]">${gstTax.toFixed(2)}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
            Grand Total
          </p>
          <p className="text-[36px] font-bold leading-none tracking-tight text-[var(--oh-text)]">
            ${whole}
            <span className="text-[22px]">.{cents}</span>
          </p>
        </div>
      </div>

      {/* Bottom action buttons — 4 large buttons per reference */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--oh-border)] p-4 sm:grid-cols-4">
        <BottomBtn label="Split Bill" onClick={() => sell.runAction("Split Bill")} />
        <BottomBtn
          label="Void Item"
          variant="danger"
          onClick={() => sell.selectedId && sell.removeLine(sell.selectedId)}
          disabled={!sell.selectedId}
        />
        <BottomBtn label="Loyalty App" onClick={() => sell.runAction("Apply Loyalty")} />
        <BottomBtn
          label="Scan Customer"
          variant="primary"
          onClick={() => sell.setView("customers")}
        />
      </div>
    </section>
  );
}

function BottomBtn({
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger" | "primary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-[var(--oh-radius)] py-3.5 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
        variant === "primary" && "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]",
        variant === "danger" && "border border-[var(--oh-border)] bg-white text-[var(--oh-danger-text)] hover:bg-[var(--oh-tile-red-bg)]",
        variant === "default" && "border border-[var(--oh-border)] bg-white text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {label}
    </button>
  );
}

function SearchDropdown() {
  const sell = useSellScreen();
  const { products, customers } = sell.searchResults ?? { products: [], customers: [] };
  if (products.length === 0 && customers.length === 0) return null;

  return (
    <div className="absolute left-5 right-5 top-full z-20 mt-1 max-h-[240px] overflow-y-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-lg">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => sell.pickSearchProduct(p)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-[var(--oh-surface)]"
        >
          <span className="text-[var(--oh-text)]">{p.name}</span>
          <span className="text-[var(--oh-muted)]">${p.price.toFixed(2)}</span>
        </button>
      ))}
      {customers.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => sell.pickSearchCustomer(c)}
          className="flex w-full cursor-pointer items-center justify-between border-t border-[var(--oh-border)] px-4 py-2.5 text-left hover:bg-[var(--oh-surface)]"
        >
          <span className="text-[13px] text-[var(--oh-text)]">{c.name}</span>
          <span className="text-[13px] text-[var(--oh-muted)]">{c.loyaltyPoints} pts</span>
        </button>
      ))}
    </div>
  );
}

function CustomerOverlay() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sell.loadCustomers(value), 250);
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-[var(--oh-radius)] bg-white">
      <div className="flex items-center gap-3 border-b border-[var(--oh-border)] px-5 py-3">
        <button
          type="button"
          onClick={() => sell.setView("keys")}
          className="cursor-pointer text-[13px] font-medium text-[var(--oh-orange)] hover:underline"
        >
          ← Back
        </button>
        <input
          type="text"
          aria-label="Search customers"
          placeholder="Search for Customers…"
          onChange={(e) => onSearch(e.target.value)}
          className="h-9 flex-1 rounded-lg border border-[var(--oh-border)] px-3 text-[13px] outline-none focus:border-[var(--oh-orange)]"
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sell.customers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              sell.setCustomer(c);
              sell.setView("keys");
            }}
            className="flex w-full cursor-pointer items-center justify-between border-b border-[var(--oh-border)] px-5 py-3 text-left hover:bg-[var(--oh-surface)]"
          >
            <span>
              <span className="block text-[14px] font-medium text-[var(--oh-text)]">{c.name}</span>
              <span className="block text-[13px] text-[var(--oh-muted)]">{c.group}</span>
            </span>
            <span className="text-[13px] text-[var(--oh-muted)]">{c.loyaltyPoints} pts</span>
          </button>
        ))}
      </div>
    </div>
  );
}
