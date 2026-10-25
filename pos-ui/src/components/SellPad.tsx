"use client";

import { useRef } from "react";
import { KeyboardIcon, ParkingIcon, SearchIcon } from "@/components/icons";
import type { SaleKey } from "@/types/orithos";
import { cn } from "@/lib/utils";
import { splitMoney, useSellScreen } from "@/lib/sell-screen";

const MAIN_KEYS: SaleKey[] = [
  { id: "eftpos", image: "/images/keys/eftpos.png", bg: "rgb(141, 18, 56)", colStart: 7, colSpan: 2, rowStart: 1, rowSpan: 2 },
  { id: "plus-quantity", image: "/images/keys/plus-quantity.png", bg: "rgb(226, 245, 205)", colStart: 9, colSpan: 2, rowStart: 1, rowSpan: 2 },
  { id: "exact-cash", image: "/images/keys/exact-cash.png", bg: "rgb(226, 245, 205)", colStart: 7, colSpan: 2, rowStart: 3, rowSpan: 2 },
  { id: "minus-quantity", image: "/images/keys/minus-quantity.png", bg: "rgb(252, 222, 171)", colStart: 9, colSpan: 2, rowStart: 3, rowSpan: 2 },
  { id: "cash-out", image: "/images/keys/cash-out.png", bg: "rgb(252, 222, 171)", colStart: 9, colSpan: 2, rowStart: 5, rowSpan: 1 },
  { id: "more-functions", image: "/images/keys/more-functions.png", bg: "rgb(206, 229, 252)", colStart: 1, colSpan: 1, rowStart: 9, rowSpan: 2 },
  { id: "carlton", image: null, label: "carlton", bg: "rgb(222, 84, 84)", textColor: "#ffffff", colStart: 10, colSpan: 1, rowStart: 9, rowSpan: 1 },
  { id: "clear-sale", image: "/images/keys/clear-sale.png", bg: "rgb(252, 222, 171)", colStart: 8, colSpan: 1, rowStart: 10, rowSpan: 1 },
  { id: "case-quantity", image: null, label: "CASE QTY", bg: "rgb(226, 245, 209)", textColor: "#1a1a1a", colStart: 9, colSpan: 2, rowStart: 10, rowSpan: 1 },
];

interface FunctionKey {
  id: string;
  image: string;
  label: string;
  bg: string;
}
const FUNCTION_BLUE = "rgb(206, 229, 252)";
const FUNCTION_ORANGE = "rgb(252, 222, 171)";
const FUNCTION_KEYS: FunctionKey[] = [
  { id: "promotions", image: "/images/keys/functions/promotions.png", label: "View Promotions", bg: FUNCTION_BLUE },
  { id: "products", image: "/images/keys/functions/products.png", label: "Products", bg: FUNCTION_BLUE },
  { id: "product-details", image: "/images/keys/functions/product-details.png", label: "Product Details", bg: FUNCTION_BLUE },
  { id: "open-drawer", image: "/images/keys/functions/open-drawer.png", label: "Open Cash Drawer", bg: FUNCTION_BLUE },
  { id: "beer", image: "/images/keys/functions/beer.png", label: "Beer", bg: FUNCTION_ORANGE },
  { id: "return-product", image: "/images/keys/functions/return-product.png", label: "Return an Item", bg: FUNCTION_BLUE },
  { id: "reload-invoice", image: "/images/keys/functions/reload-invoice.png", label: "Reload Invoice", bg: FUNCTION_BLUE },
  { id: "gift-card", image: "/images/keys/functions/gift-card.png", label: "Gift Card", bg: FUNCTION_BLUE },
  { id: "add-note", image: "/images/keys/functions/add-note.png", label: "Add Note", bg: FUNCTION_BLUE },
  { id: "wines", image: "/images/keys/functions/wines.png", label: "Wines", bg: FUNCTION_ORANGE },
  { id: "back-home", image: "/images/keys/functions/back-home.png", label: "Back Home", bg: "#ffffff" },
  { id: "customer-payment", image: "/images/keys/functions/customer-payment.png", label: "Customer Payment", bg: FUNCTION_BLUE },
  { id: "live-profit", image: "/images/keys/functions/live-profit.png", label: "Live Profit", bg: FUNCTION_BLUE },
  { id: "create-customer", image: "/images/keys/functions/create-customer.png", label: "Create Customer", bg: FUNCTION_BLUE },
  { id: "spirits", image: "/images/keys/functions/spirits.png", label: "Spirits", bg: FUNCTION_ORANGE },
];

export function SellPad() {
  const sell = useSellScreen();

  if (sell.view === "customers") return <CustomerPicker />;
  if (sell.view === "promotions") return <PromotionsPanel />;
  if (sell.view === "products") return <ProductsBrowsePanel />;

  return (
    <div className="flex min-w-0 flex-1 flex-col border-[0.667px] border-[var(--oh-border-strong)]">
      <SearchBar />
      <div className="relative flex-1 bg-[var(--sf-pad-bg)]">
        {sell.view === "parked" ? (
          <ParkedSalesPanel />
        ) : sell.keypadPage === 1 ? (
          <FunctionGrid />
        ) : (
          <MainGrid />
        )}
      </div>
      <div className="hidden shrink-0 lg:block">
        <div className="h-1 w-full bg-[var(--oh-border)]">
          <div
            className="h-full bg-[var(--sf-tab-blue)] transition-all"
            style={{ width: sell.view === "parked" ? "100%" : sell.keypadPage === 1 ? "80%" : "40%" }}
          />
        </div>
        <ul role="tablist" aria-label="Sell views" className="flex h-[50px] items-center justify-between bg-[var(--oh-surface-elevated)]">
          <li className="flex flex-1">
            <button
              type="button"
              role="tab"
              onClick={() => sell.setView("keys")}
              aria-selected={sell.view === "keys"}
              aria-controls="sell-keys-panel"
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center justify-center text-[19.2px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
              sell.view === "keys" ? "text-[var(--sf-tab-blue)]" : "text-[var(--oh-text)]",
            )}
            >
              <KeyboardIcon size={19} strokeWidth={1.5} className="mr-2" />
              Sales Keys
            </button>
          </li>
          <li className="flex flex-1">
            <button
              type="button"
              role="tab"
              onClick={() => sell.setView("parked")}
              aria-selected={sell.view === "parked"}
              aria-controls="parked-sales-panel"
            className={cn(
              "flex min-h-11 w-full cursor-pointer items-center justify-center text-[19.2px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
              sell.view === "parked" ? "text-[var(--sf-tab-blue)]" : "text-[var(--oh-text)]",
            )}
            >
              <ParkingIcon size={19} strokeWidth={1.5} className="mr-2" />
              Parked Sales
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

function SearchBar() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isParked = sell.view === "parked";

  function onChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isParked) return;
    debounceRef.current = setTimeout(() => {
      sell.setSearchQuery(value);
      sell.setSearchOpen(!!value.trim());
    }, 250);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && isParked && sell.lines.length > 0) {
      sell.parkCurrentSale();
    }
  }

  return (
    <div className="relative flex h-[50px] shrink-0">
      <input
        type="text"
        value={sell.searchQuery}
        aria-label={isParked ? "Park sale" : "Search products and customers"}
        aria-controls={sell.searchOpen && sell.searchResults ? "sell-search-results" : undefined}
        placeholder={
          isParked ? "Park Sale" : "Search for Products and Customers..."
        }
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => !isParked && sell.setSearchOpen(true)}
        onKeyDown={onKeyDown}
        className="h-[50px] w-full border border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] px-4 text-[16px] text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
      />
      <button
        type="button"
        aria-label="Options"
        className="flex h-[50px] w-[50px] shrink-0 items-center justify-center border border-l-0 border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] text-[24px] leading-none text-[var(--sf-placeholder)] lg:hidden"
      >
        ···
      </button>
      {sell.searchOpen && sell.searchResults && !isParked && (
        <SearchDropdown />
      )}
    </div>
  );
}

function SearchDropdown() {
  const sell = useSellScreen();
  const { products, customers } = sell.searchResults ?? { products: [], customers: [] };
  if (products.length === 0 && customers.length === 0) return null;

  return (
    <div id="sell-search-results" role="listbox" aria-label="Product and customer search results" className="absolute left-0 right-0 top-[50px] z-20 max-h-[320px] overflow-y-auto border border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] shadow-lg">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => sell.pickSearchProduct(p)}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-[var(--oh-surface-muted)]"
        >
          <span className="text-[16px] text-[var(--oh-text)]">{p.name}</span>
          <span className="text-[16px] text-[var(--sf-muted)]">${p.price.toFixed(2)}</span>
        </button>
      ))}
      {customers.map((c) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => sell.pickSearchCustomer(c)}
            className="flex w-full cursor-pointer items-center justify-between border-t border-[var(--oh-border)] px-4 py-3 text-left hover:bg-[var(--oh-surface-muted)]"
        >
          <span>
            <span className="block text-[16px] text-[var(--oh-text)]">{c.name}</span>
            <span className="block text-[13px] text-[var(--sf-muted)]">{c.groupName}</span>
          </span>
          <span className="text-[14px] text-[var(--sf-muted)]">{c.loyaltyPoints} pts</span>
        </button>
      ))}
    </div>
  );
}

function ParkedSalesPanel() {
  const sell = useSellScreen();

  return (
    <div id="parked-sales-panel" className="absolute inset-0 flex flex-col overflow-hidden">
      {sell.lines.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--oh-border)] bg-[var(--brand-info-tint)] px-4 py-3">
          <span className="text-[15px] text-[var(--oh-text)]">
            Active sale — {sell.itemCount} items, ${sell.total.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => sell.parkCurrentSale()}
            disabled={sell.busy}
            className="cursor-pointer rounded bg-[var(--sf-link-blue)] px-4 py-1.5 text-[14px] text-white hover:brightness-95 disabled:opacity-50"
          >
            Park Sale
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sell.parkedLoading ? (
          <div className="flex h-full items-center justify-center text-[16px] text-[var(--sf-muted)]">
            Loading parked sales…
          </div>
        ) : sell.parkedSales.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[16px] text-[var(--sf-muted)]">
            No parked sales
          </div>
        ) : (
          sell.parkedSales.map((sale) => {
            const total = splitMoney(Number(sale.totalPrice));
            return (
              <button
                key={sale.id}
                type="button"
                onClick={() => sell.requestResumeParked(String(sale.id))}
                disabled={sell.busy}
                className="flex w-full cursor-pointer items-center justify-between border-b border-[var(--oh-border)] px-4 py-4 text-left hover:bg-[var(--oh-surface-muted)] disabled:opacity-50"
              >
                <span>
                  <span className="block text-[18px] text-[var(--oh-text)]">
                    {sale.customerName ?? "No customer"}
                  </span>
                  <span className="block text-[14px] text-[var(--sf-muted)]">
                    {sale.totalQuantity} items
                  </span>
                </span>
                <span className="text-[18px] font-bold text-[var(--oh-text)]">
                  ${total.whole}.{total.cents}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MainGrid() {
  const sell = useSellScreen();
  const cartEmpty = sell.lines.length === 0;

  const isDisabled = (id: string) =>
    cartEmpty &&
    (id === "plus-quantity" ||
      id === "minus-quantity" ||
      id === "clear-sale" ||
      id === "case-quantity");

  function activate(id: string) {
    switch (id) {
      case "carlton":
        sell.addQuickKey("carlton");
        break;
      case "plus-quantity":
        sell.incQty();
        break;
      case "minus-quantity":
        sell.decQty();
        break;
      case "clear-sale":
        sell.requestClear();
        break;
      case "more-functions":
        sell.setKeypadPage(1);
        break;
      case "eftpos":
        sell.startPayment("EFTPOS VISA MasterCard");
        break;
      case "exact-cash":
        sell.startPayment("Exact Cash");
        break;
      case "cash-out":
        sell.startPayment("Eftpos Cash Out");
        break;
      case "case-quantity":
        sell.applyCaseQuantity();
        break;
    }
  }

  return (
    <div id="sell-keys-panel" className="absolute inset-0 hidden grid-cols-10 grid-rows-10 lg:grid">
      {MAIN_KEYS.map((key) => {
        const disabled = isDisabled(key.id);
        return (
          <button
            key={key.id}
            type="button"
            disabled={disabled}
            aria-label={key.label ?? key.id}
            onClick={() => activate(key.id)}
            style={{
              backgroundColor: key.bg,
              gridColumn: `${key.colStart} / span ${key.colSpan}`,
              gridRow: `${key.rowStart} / span ${key.rowSpan}`,
            }}
            className={cn(
              "flex items-center justify-center border-[0.667px] border-white p-0 transition-colors duration-200 ease-in-out focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]",
              disabled ? "cursor-not-allowed brightness-50" : "cursor-pointer hover:brightness-95",
            )}
          >
            {key.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={key.image} alt={key.id} className="h-full w-auto object-fill" />
            ) : (
              <span className="text-center text-[16px] font-normal" style={{ color: key.textColor }}>
                {key.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FunctionGrid() {
  const sell = useSellScreen();

  function activate(key: FunctionKey) {
    switch (key.id) {
      case "back-home":
        sell.setKeypadPage(0);
        return;
      case "create-customer":
        sell.setView("customers");
        return;
      case "promotions":
        sell.openPromotions();
        return;
      case "products":
        sell.openProducts("Products");
        return;
      case "beer":
        sell.openProducts("Beer");
        return;
      case "wines":
        sell.openProducts("Wines");
        return;
      case "spirits":
        sell.openProducts("Spirits");
        return;
      case "open-drawer":
        sell.runAction(key.label);
        return;
      default:
        sell.runAction(key.label);
    }
  }

  return (
    <div id="sell-keys-panel" className="absolute inset-0 hidden grid-cols-5 grid-rows-3 lg:grid">
      {FUNCTION_KEYS.map((key) => (
        <button
          key={key.id}
          type="button"
          aria-label={key.label}
          onClick={() => activate(key)}
          style={{ backgroundColor: key.bg }}
          className="flex cursor-pointer items-center justify-center border-[0.667px] border-white p-4 transition-colors duration-200 ease-in-out hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={key.image} alt={key.label} className="max-h-full max-w-full object-contain" />
        </button>
      ))}
    </div>
  );
}

const PERIOD_LABELS: Record<string, string> = {
  current: "Current",
  future: "Future",
  all: "All",
};

/** View Promotions — replaces the keys area (matches live Shopfront panel). */
function PromotionsPanel() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onFilter(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sell.setPromotionFilter(value), 300);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col border-[0.667px] border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)]">
      <div className="flex h-[50px] shrink-0 items-center gap-3 border-b border-[var(--oh-border)] px-4">
        <button
          type="button"
          onClick={() => sell.backToKeys()}
          className="flex cursor-pointer items-center gap-2 text-[16px] text-[var(--oh-text)] hover:opacity-70"
        >
          <span className="text-[18px]">←</span> Back
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => sell.setPromotionMenuOpen(!sell.promotionMenuOpen)}
            className="flex cursor-pointer items-center gap-2 rounded border border-[var(--sf-muted)] px-3 py-1.5 text-[16px] text-[var(--oh-text)]"
          >
            {PERIOD_LABELS[sell.promotionPeriod]}
            <span className="text-[13px]">▼</span>
          </button>
          {sell.promotionMenuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] border border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] shadow-lg">
              {(["all", "current", "future"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sell.setPromotionPeriod(p)}
                  className={cn(
            "block w-full cursor-pointer px-4 py-2 text-left text-[16px] hover:bg-[var(--oh-surface-muted)]",
                    sell.promotionPeriod === p ? "bg-[var(--brand-info-tint)]" : "text-[var(--oh-text)]",
                  )}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 px-4 py-3">
        <input
          type="text"
          aria-label="Filter promotions"
          defaultValue={sell.promotionFilter}
          placeholder="Filter by product, classification or promotional category..."
          onChange={(e) => onFilter(e.target.value)}
          className="h-[44px] w-full border border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] px-4 text-[16px] text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sell.promotionLoading ? (
          <div className="flex h-32 items-center justify-center text-[16px] text-[var(--sf-muted)]">
            Loading…
          </div>
        ) : sell.promotionItems.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[16px] text-[var(--sf-muted)]">
            No products found
          </div>
        ) : (
          sell.promotionItems.map((item, i) => (
            <button
              key={`${item.productId}-${item.promotionId}-${i}`}
              type="button"
              onClick={() => sell.pickPromotionProduct(item)}
              className={cn(
                "flex w-full cursor-pointer items-center justify-between border-b border-[var(--oh-border)] px-4 py-3 text-left hover:bg-[var(--oh-surface-muted)]",
                i % 2 === 0 ? "bg-[var(--oh-surface-muted)]" : "bg-[var(--oh-surface-elevated)]",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] text-[var(--oh-text)]">{item.productName}</span>
                <span className="block text-[13px] text-[var(--sf-muted)]">
                  {item.promotionName}
                  {item.promotionCategoryName ? ` · ${item.promotionCategoryName}` : ""}
                </span>
                {item.discountAmount != null && item.discountAmount > 0 && (
                  <span className="block text-[13px] text-[var(--oh-success)]">
                    Save ${Number(item.discountAmount).toFixed(2)}
                  </span>
                )}
              </span>
              <span className="ml-3 shrink-0 text-[16px] text-[var(--oh-text)]">
                ${Number(item.price).toFixed(2)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Products / Beer / Wines / Spirits quick-key folder grid. */
function ProductsBrowsePanel() {
  const sell = useSellScreen();

  return (
    <div className="relative flex min-w-0 flex-1 flex-col border-[0.667px] border-[var(--oh-border-strong)] bg-[var(--oh-surface-muted)]">
      <div className="relative flex h-[50px] shrink-0 items-center justify-center border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
        <button
          type="button"
          onClick={() => sell.backToKeys()}
          className="absolute left-4 flex cursor-pointer items-center gap-2 text-[16px] text-[var(--oh-text)] hover:opacity-70"
        >
          <span className="text-[18px]">←</span> Back
        </button>
        <span className="text-[16px] font-semibold text-[var(--oh-text)]">{sell.productFolder}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sell.productLoading ? (
          <div className="flex h-32 items-center justify-center text-[16px] text-[var(--sf-muted)]">
            Loading…
          </div>
        ) : sell.productItems.length === 0 ? (
          <div className="flex h-32 items-center justify-center bg-[var(--oh-surface-elevated)] text-[16px] text-[var(--sf-muted)]">
            No products found
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[2px] sm:grid-cols-4 lg:grid-cols-5">
            {sell.productItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => sell.pickBrowseProduct(item)}
                className="flex min-h-[88px] cursor-pointer items-center justify-center bg-[var(--oh-surface-inverse)] px-2 py-3 text-center transition-colors hover:bg-[var(--oh-primary)]"
              >
                <span className="line-clamp-3 text-[13px] leading-tight text-white lg:text-[14px]">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerPicker() {
  const sell = useSellScreen();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sell.loadCustomers(value), 250);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col border-[0.667px] border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)]">
      <div className="flex h-[50px] shrink-0">
        <input
          type="text"
          aria-label="Search customers"
          placeholder="Search for Customers..."
          onChange={(e) => onSearch(e.target.value)}
          className="h-[50px] w-full border border-[var(--sf-muted)] bg-[var(--oh-surface-elevated)] px-4 text-[16px] text-[var(--oh-text)] outline-none placeholder:text-[var(--sf-placeholder)]"
        />
      </div>
        <div className="flex h-[48px] shrink-0 items-center gap-6 border-b border-[var(--oh-border)] px-4">
        <button
          type="button"
          onClick={() => sell.setView("keys")}
          className="flex cursor-pointer items-center gap-2 text-[16px] text-[var(--oh-text)] hover:opacity-70"
        >
          <span className="text-[18px]">←</span> Back
        </button>
        <button
          type="button"
          onClick={() => sell.runAction("Create Customer")}
          className="flex cursor-pointer items-center gap-2 text-[16px] text-[var(--oh-text)] hover:opacity-70"
        >
          <SearchIcon size={16} strokeWidth={1.5} /> Create New
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sell.customers.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              sell.setCustomer(c);
              sell.setView("keys");
            }}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-[var(--oh-surface-muted)]",
              i % 2 === 0 ? "bg-[var(--oh-surface-muted)]" : "bg-[var(--oh-surface-elevated)]",
            )}
          >
            <span>
              <span className="block text-[18px] text-[var(--oh-text)]">{c.name}</span>
              <span className="block text-[14px] text-[var(--sf-muted)]">{c.group}</span>
            </span>
            <span className="text-right">
              <span className="block text-[18px] text-[var(--oh-text)]">{c.loyaltyPoints}</span>
              <span className="block text-[14px] text-[var(--sf-muted)]">Loyalty Points</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
