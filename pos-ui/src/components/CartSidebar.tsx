"use client";

import { PlusIcon, DeleteIcon, XIcon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { splitMoney, useSellScreen } from "@/lib/sell-screen";

/**
 * Orithos "Sell" cart sidebar — Add Customer header, the live product list,
 * sale summary and the Finalise button. All wired to the shared sell state.
 */
export function CartSidebar() {
  const sell = useSellScreen();
  const router = useRouter();
  const { whole, cents } = splitMoney(sell.total);
  const hasItems = sell.lines.length > 0;
  const muted = "text-[rgba(189,189,189,0.7)]";

  return (
    <div className="flex w-full flex-col border-[0.667px] border-black bg-white font-sans lg:w-[419px]">
      {/* Add Customer / selected customer */}
      <div className="flex h-[75px] shrink-0 items-center border-b-[0.667px] border-black">
        {sell.customer ? (
          <>
            <button
              type="button"
              onClick={() => sell.setView("customers")}
              className="flex flex-1 cursor-pointer items-center text-left"
            >
              <span className="ml-4 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--sf-muted)] text-white">
                {sell.customer.name.charAt(0)}
              </span>
              <span className="mx-2">
                <span className="block text-[18.72px] font-bold text-black">
                  {sell.customer.name}
                </span>
                <span className="block text-[14px] text-[var(--sf-muted)]">
                  {sell.customer.loyaltyPoints} Loyalty Points
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Remove customer"
              onClick={() => sell.setCustomer(null)}
              className="mr-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-[var(--sf-muted)] outline-none hover:text-black focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            >
              <XIcon size={20} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => sell.setView("customers")}
            className="flex h-full flex-1 cursor-pointer items-center"
          >
            <PlusIcon size={18} strokeWidth={1.5} className="ml-4 mr-2 text-black" />
            <h3 className="text-[18.72px] font-bold text-black">Add Customer</h3>
          </button>
        )}
      </div>

      {/* Product list */}
      <div className="hidden min-h-0 flex-1 overflow-y-auto lg:block">
        {sell.lines.map((line) => {
          const lineTotal = splitMoney(line.qty * line.unitPrice);
          const selected = sell.selectedId === line.id;
          return (
            <div
              key={line.id}
              tabIndex={0}
              aria-label={`Select ${line.name}`}
              onClick={() => sell.selectLine(line.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  sell.selectLine(line.id);
                }
              }}
              className={cn(
                "flex cursor-pointer items-center gap-3 border-b border-[#eee] px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
                selected ? "bg-[rgb(206,229,252)]" : "bg-white hover:bg-black/5",
              )}
            >
              <span className="w-6 shrink-0 text-[16px] text-black">{line.qty}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] text-black">{line.name}</span>
                {line.qty > 1 && (
                  <span className="block text-[13px] text-[var(--sf-muted)]">
                    Item price: ${line.unitPrice.toFixed(2)}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[16px] text-black">
                ${lineTotal.whole}.{lineTotal.cents}
              </span>
              <button
                type="button"
                aria-label={`Remove ${line.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  sell.removeLine(line.id);
                }}
                className="shrink-0 cursor-pointer text-[var(--sf-muted)] hover:text-[rgb(222,84,84)]"
              >
                <DeleteIcon size={18} strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary + Finalise footer */}
      <div className="relative shrink-0">
        <div className="flex h-[93px]">
          {/* Left: basic summary */}
          <div className={cn("flex flex-1 flex-col justify-center p-2", muted)}>
            {hasItems ? (
              <>
                <p className="text-[16px] leading-[19px]">
                  {sell.itemCount} {sell.itemCount === 1 ? "Item" : "Items"}
                </p>
                <p className="text-[16px] leading-[19px]">
                  {sell.productCount} {sell.productCount === 1 ? "Product" : "Products"}
                </p>
                <p className="text-[16px] leading-[19px]">Subtotal: ${sell.subtotal.toFixed(2)}</p>
                <p className="text-[16px] leading-[19px]">Discount: -${sell.discountTotal.toFixed(2)}</p>
              </>
            ) : (
              <>
                <p className="text-[16px] leading-[19px]">0 Products</p>
                <p className="text-[16px] leading-[19px]">Subtotal: $0.00</p>
                <p className="text-[16px] leading-[19px]">Discount: -$0.00</p>
              </>
            )}
          </div>
          {/* Right: total */}
          <div className={cn("flex flex-1 flex-col items-center justify-center p-2 text-center", hasItems ? "text-black" : muted)}>
            <p className="leading-none">
              <span className="text-[40px]">${whole}</span>
              <span className="align-top text-[24px]">.{cents}</span>
            </p>
            <p className="text-[24px] [font-variant:small-caps]">Total</p>
          </div>
        </div>

        <button
          type="button"
          disabled={!hasItems}
          onClick={() => router.push("/finalise")}
          className={cn(
            "h-[50px] w-full px-2 py-1 text-center text-[32px] text-[var(--sf-on-dark)] [font-variant:small-caps]",
            hasItems
              ? "cursor-pointer bg-[var(--sf-link-blue)] hover:brightness-95"
              : "cursor-not-allowed bg-[#bdbdbd]",
          )}
        >
          Finalise
        </button>
      </div>
    </div>
  );
}
