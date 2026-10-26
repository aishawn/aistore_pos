"use client";

import type { KeyboardEvent, RefObject } from "react";
import { ArrowLeft, LoaderCircle, Minus, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { CartIcon, PlusIcon } from "@/components/icons";
import type { OdooCheckoutQuote, OdooCustomerRecord } from "@/lib/odoo-api";
import { friendlyProductName } from "@/lib/product-display-name";
import { splitMoney } from "@/lib/sell-screen";
import { cn } from "@/lib/utils";
import { OdooSellFinaliseButton } from "./OdooSellFinaliseButton";
import { CASE_PACK_OPTIONS, money, provisionalLineUnit, type CartLine } from "./shared";

type OdooSellCartAsideProps = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  customer: OdooCustomerRecord | null;
  customerQuery: string;
  customers: OdooCustomerRecord[];
  customerSearchLoading: boolean;
  customerSearchError: string | null;
  customerActiveIndex: number;
  onCustomerQueryChange: (value: string) => void;
  onCustomerSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelectCustomer: (customer: OdooCustomerRecord) => void;
  onRemoveCustomer: () => void;
  onRetryCustomerSearch: () => void;
  query: string;
  productSearchRef: RefObject<HTMLInputElement | null>;
  productsLength: number;
  productActiveOptionId: string | undefined;
  productsLoading: boolean;
  onProductQueryChange: (value: string) => void;
  onProductSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  lines: CartLine[];
  selectedLineKey: string | null;
  quote: OdooCheckoutQuote | null;
  quoteIsCurrent: boolean;
  onSelectLine: (key: string) => void;
  onRemoveLine: (productId: number, packFactor: number, key: string) => void;
  onChangeQuantity: (productId: number, packFactor: number, delta: number) => void;
  onSetPackFactor: (productId: number, currentFactor: number, nextFactor: number) => void;
  lineKey: (productId: number, packFactor: number) => string;
  quantity: number;
  productCount: number;
  subtotal: number;
  taxTotal: number;
  quoteLoading: boolean;
  quoteError: string | null;
  showQuoteRetry: boolean;
  onRetryQuote: () => void;
  awaitingCardConfirm: boolean;
  onFocusTerminalConfirm: () => void;
  canFinalise: boolean;
  finaliseLabel: string;
  finaliseTitle: string;
  onFinalise: () => void;
  showFinaliseHint: boolean;
  totalWhole: string;
  totalCents: string;
  busy: boolean;
};

export function OdooSellCartAside({
  mobileOpen,
  onCloseMobile,
  customer,
  customerQuery,
  customers,
  customerSearchLoading,
  customerSearchError,
  customerActiveIndex,
  onCustomerQueryChange,
  onCustomerSearchKeyDown,
  onSelectCustomer,
  onRemoveCustomer,
  onRetryCustomerSearch,
  query,
  productSearchRef,
  productsLength,
  productActiveOptionId,
  productsLoading,
  onProductQueryChange,
  onProductSearchKeyDown,
  lines,
  selectedLineKey,
  quote,
  quoteIsCurrent,
  onSelectLine,
  onRemoveLine,
  onChangeQuantity,
  onSetPackFactor,
  lineKey,
  quantity,
  productCount,
  subtotal,
  taxTotal,
  quoteLoading,
  quoteError,
  showQuoteRetry,
  onRetryQuote,
  awaitingCardConfirm,
  onFocusTerminalConfirm,
  canFinalise,
  finaliseLabel,
  finaliseTitle,
  onFinalise,
  showFinaliseHint,
  totalWhole,
  totalCents,
}: OdooSellCartAsideProps) {
  return (
    <aside className={cn(
      "order-3 flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)] lg:order-none lg:col-start-1 lg:row-start-2 lg:w-auto",
      mobileOpen && "fixed inset-x-0 top-[50px] bottom-0 z-50 min-h-0 w-auto rounded-none lg:static lg:inset-auto lg:z-auto lg:rounded-[var(--oh-radius)]",
    )}>
      {mobileOpen && (
        <div className="shrink-0 border-b border-[var(--oh-border)] px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back to products
          </button>
        </div>
      )}
      <div className="border-b border-[var(--oh-border)] px-4 py-3">
        {customer ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--oh-surface-inverse)] text-[13px] font-bold text-white">
              {customer.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-[var(--oh-text)]">{customer.name}</p>
              <p className="text-[13px] text-[var(--oh-muted)]">Orithos customer</p>
            </div>
            <button
              type="button"
              aria-label="Remove customer"
              onClick={onRemoveCustomer}
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)]"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <label className="flex min-h-11 w-full cursor-text items-center gap-2 rounded-lg border border-dashed border-[var(--oh-border)] px-3 py-2.5">
            <PlusIcon size={15} strokeWidth={1.75} className="text-[var(--oh-text-secondary)]" />
            <input
              value={customerQuery}
              aria-label="Search customers"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="customer-search-results"
              aria-expanded={customers.length > 0}
              aria-activedescendant={customerActiveIndex >= 0 ? `customer-option-${customers[customerActiveIndex]?.id}` : undefined}
              onChange={(event) => onCustomerQueryChange(event.target.value)}
              onKeyDown={onCustomerSearchKeyDown}
              placeholder="Add customer"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-text-secondary)]"
            />
          </label>
        )}
        {!customer && customerSearchLoading && (
          <p role="status" className="mt-2 text-xs text-[var(--oh-muted)]">
            Searching customers…
          </p>
        )}
        {!customer && customerSearchError && (
          <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900">
            <span>{customerSearchError}</span>
            <button type="button" onClick={onRetryCustomerSearch} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}
        {!customer && customers.length > 0 && (
          <div id="customer-search-results" role="listbox" aria-label="Customer search results" className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[var(--oh-border)]">
            {customers.map((item, index) => (
              <button
                id={`customer-option-${item.id}`}
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === customerActiveIndex}
                onClick={() => onSelectCustomer(item)}
                className={cn(
                  "flex min-h-11 w-full items-center border-b border-[var(--oh-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--oh-orange-light)]",
                  index === customerActiveIndex && "bg-[var(--oh-orange-light)]",
                )}
              >
                {item.name}
                <span className="ml-2 text-xs text-[var(--oh-text-secondary)]">{item.phone || item.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-[var(--oh-border)] px-4 py-3">
        <div className="flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3">
          <Search size={16} className="shrink-0 text-[var(--sf-placeholder)]" />
          <input
            ref={productSearchRef}
            aria-label="Search products by name, barcode or code"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="pos-product-results"
            aria-expanded={productsLength > 0}
            aria-activedescendant={productActiveOptionId}
            value={query}
            onChange={(event) => onProductQueryChange(event.target.value)}
            onKeyDown={onProductSearchKeyDown}
            placeholder="Search or scan to add a product"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
          />
          {productsLoading && <LoaderCircle size={14} className="animate-spin text-[var(--sf-placeholder)]" />}
        </div>
      </div>

      <div className="min-h-[120px] flex-1 overflow-y-auto">
        {!lines.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <CartIcon size={28} className="text-[var(--oh-border-strong)]" />
            <p className="text-[14px] font-medium text-[var(--oh-text-secondary)]">Cart is empty</p>
            <p className="text-[13px] text-[var(--oh-muted)]">Search or tap a quick key to add items</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--oh-border)]">
            {lines.map(({ product, quantity: qty, packFactor, discountPercent = 0 }) => {
              const factor = packFactor || 1;
              const key = lineKey(product.id, factor);
              const quotedLine = quoteIsCurrent
                ? quote?.lines.find((line) => line.productId === product.id && line.uomFactor === factor)
                : undefined;
              const provisionalUnit = provisionalLineUnit(product, factor);
              const lineTotal = splitMoney(quotedLine?.total ?? provisionalUnit * qty * (1 - discountPercent / 100));
              const unitPrice = quotedLine ? quotedLine.total / qty : provisionalUnit;
              const fullName = product.display_name || product.name;
              const label = friendlyProductName(fullName);
              const selected = selectedLineKey === key;
              return (
                <li key={key}>
                  <div
                    role="button"
                    tabIndex={-1}
                    onClick={() => onSelectLine(key)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                      selected ? "bg-[var(--oh-orange-light)]/50" : "hover:bg-[var(--oh-surface)]",
                    )}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] text-[13px] font-semibold text-[var(--oh-text-secondary)]">
                      {qty}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--oh-text)]" title={fullName}>
                        {label}
                      </p>
                      <p className="text-[13px] text-[var(--oh-muted)]">
                        {factor > 1 ? `${money(unitPrice)} / case · ${factor}` : `${money(unitPrice)} each`}
                        {discountPercent > 0 ? ` · ${discountPercent}% off` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold text-[var(--oh-text)]">
                      ${lineTotal.whole}.{lineTotal.cents}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveLine(product.id, factor, key);
                      }}
                      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)]"
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </div>
                  {selected && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/40 px-4 py-2 pl-[4.25rem]">
                      <button
                        type="button"
                        aria-label={`Decrease ${label}`}
                        onClick={() => onChangeQuantity(product.id, factor, -1)}
                        className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]"
                      >
                        <Minus size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Increase ${label}`}
                        onClick={() => onChangeQuantity(product.id, factor, 1)}
                        className="grid h-11 w-11 place-items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]"
                      >
                        <Plus size={15} />
                      </button>
                      <label className="flex items-center gap-2 text-[13px] text-[var(--oh-text-secondary)]">
                        Pack
                        <select
                          aria-label={`Pack size for ${label}`}
                          value={factor}
                          onChange={(event) => onSetPackFactor(product.id, factor, Number(event.target.value))}
                          className="h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2 text-[13px] font-semibold text-[var(--oh-text)]"
                        >
                          {CASE_PACK_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size === 1 ? "Each" : `Case ×${size}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/50 p-4">
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-[var(--oh-muted)]">
          <span>
            {quantity} {quantity === 1 ? "item" : "items"}
          </span>
          <span className="text-right">{productCount} products</span>
          <span>Subtotal {money(subtotal)}</span>
          <span className="text-right">GST {quoteLoading ? "…" : money(taxTotal)}</span>
        </div>
        {showQuoteRetry && quoteError && (
          <div role="alert" className="mb-3 grid gap-1.5 text-left text-xs text-red-800">
            <span>{quoteError}</span>
            <button
              type="button"
              onClick={onRetryQuote}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-red-300 bg-[var(--oh-surface-elevated)] px-3 font-semibold text-red-900 hover:bg-red-50"
            >
              <RefreshCw size={14} /> Retry quote
            </button>
          </div>
        )}
        {awaitingCardConfirm && (
          <button
            type="button"
            onClick={onFocusTerminalConfirm}
            className="mb-2 flex min-h-11 w-full items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-left text-xs font-semibold text-amber-950 hover:bg-amber-100"
          >
            <span>Card payment is waiting for terminal approval</span>
            <span className="shrink-0 underline underline-offset-2">Review above</span>
          </button>
        )}
        {showFinaliseHint && (
          <p role="status" className="mb-2 text-xs font-medium text-amber-800">
            {finaliseLabel}
          </p>
        )}
        <div className="flex items-end justify-between gap-3">
          <span className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Total</span>
          <p className="text-[32px] font-bold leading-none text-[var(--oh-text)]">
            ${totalWhole}
            <span className="text-[20px]">.{totalCents}</span>
          </p>
        </div>
        {lines.length > 0 && (
          <OdooSellFinaliseButton
            canFinalise={canFinalise}
            awaitingCardConfirm={awaitingCardConfirm}
            label={finaliseLabel}
            title={finaliseTitle}
            onClick={onFinalise}
            className="mt-3 w-full"
          />
        )}
      </div>
    </aside>
  );
}
