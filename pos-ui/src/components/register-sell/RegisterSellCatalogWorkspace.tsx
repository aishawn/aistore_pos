"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert, LayoutGrid, List, LoaderCircle, Search, ShoppingCart } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import type { OdooPosCategoryRecord, OdooProductRecord } from "@/lib/odoo-api";
import { friendlyProductName } from "@/lib/product-display-name";
import { cn } from "@/lib/utils";
import { SALE_KEY_CATEGORIES } from "@/lib/sale-key-categories";
import {
  CATEGORY_TILE_TONES,
  SALE_KEY_TILE_CLASS,
  formatStockQty,
  money,
  shelfUnitPrice,
  type CatalogDensity,
} from "./shared";

type RegisterSellCatalogWorkspaceProps = {
  showCatalogHome: boolean;
  showMobileCartButton?: boolean;
  onViewCart?: () => void;
  categoriesError: string | null;
  categoriesLoading: boolean;
  categoryTiles: OdooPosCategoryRecord[];
  onRetryCategories: () => void;
  onOpenCategory: (id: number | null) => void;
  onOpenQuickCategory: (name: string) => void;
  linesLength: number;
  targetLineQuantity: number;
  onIncrementQty: () => void;
  onDecrementQty: () => void;
  onCaseQuantity: () => void;
  onReturnItem: () => void;
  canDiscount: boolean;
  onDiscount: () => void;
  onPark: () => void;
  onClear: () => void;
  parkedLoaded: boolean;
  hasConfig: boolean;
  busy: boolean;
  backToCatalogHome: () => void;
  categoryId: number | null;
  query: string;
  posCategories: OdooPosCategoryRecord[];
  hideOutOfStock: boolean;
  onHideOutOfStockChange: (value: boolean) => void;
  catalogDensity: CatalogDensity;
  onCatalogDensityChange: (value: CatalogDensity) => void;
  products: OdooProductRecord[];
  productsLoading: boolean;
  productsError: string | null;
  productsHasNext: boolean;
  productsLoadingMore: boolean;
  productActiveIndex: number;
  sessionOpen: boolean;
  onRetryProducts: () => void;
  onLoadMoreProducts: () => void;
  onAddProduct: (product: OdooProductRecord) => void;
};

export function RegisterSellCatalogWorkspace({
  showCatalogHome,
  showMobileCartButton = false,
  onViewCart,
  categoriesError,
  categoriesLoading,
  categoryTiles,
  onRetryCategories,
  onOpenCategory,
  onOpenQuickCategory,
  linesLength,
  targetLineQuantity,
  onIncrementQty,
  onDecrementQty,
  onCaseQuantity,
  onReturnItem,
  canDiscount,
  onDiscount,
  onPark,
  onClear,
  parkedLoaded,
  hasConfig,
  busy,
  backToCatalogHome,
  categoryId,
  query,
  posCategories,
  hideOutOfStock,
  onHideOutOfStockChange,
  catalogDensity,
  onCatalogDensityChange,
  products,
  productsLoading,
  productsError,
  productsHasNext,
  productsLoadingMore,
  productActiveIndex,
  sessionOpen,
  onRetryProducts,
  onLoadMoreProducts,
  onAddProduct,
}: RegisterSellCatalogWorkspaceProps) {
  const lineControls = (
    <div>
      <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Line controls</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!linesLength}
          onClick={onIncrementQty}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Qty
        </button>
        <button
          type="button"
          disabled={!linesLength || targetLineQuantity <= 1}
          onClick={onDecrementQty}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          − Qty
        </button>
        <button
          type="button"
          disabled={!linesLength}
          onClick={onCaseQuantity}
          title={linesLength ? "Switch pack size on the selected line: Each → 6 → 12 → 24" : "Add a product first"}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Case Qty
        </button>
        <button
          type="button"
          disabled={!linesLength}
          onClick={onReturnItem}
          title="Open completed sales to select and record a full refund"
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Return Item
        </button>
        {canDiscount && <button
          type="button"
          disabled={!linesLength}
          onClick={onDiscount}
          title="Apply a percentage discount to the selected cart line"
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Discount
        </button>}
        <button
          type="button"
          disabled={!linesLength || !parkedLoaded || !hasConfig || busy}
          onClick={onPark}
          title={!linesLength ? "Nothing to park" : "Save this cart on this terminal"}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Park Sale
        </button>
        <button
          type="button"
          disabled={!linesLength}
          onClick={onClear}
          title={linesLength ? "Clear the current cart" : "Cart is already empty"}
          className={cn(
            "min-h-11 rounded-lg border px-3 py-2 text-[13px] font-medium hover:border-[var(--oh-orange)] disabled:cursor-not-allowed disabled:opacity-40",
            linesLength
              ? "border-[var(--oh-tile-red-border)] bg-[var(--oh-surface-elevated)] text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)]"
              : "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] text-[var(--oh-text-secondary)]",
          )}
        >
          Clear Sale
        </button>
      </div>
    </div>
  );

  if (showCatalogHome) {
    return (
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">Sale keys</p>
            <span className="text-[13px] text-[var(--oh-muted)]">Home Keys</span>
          </div>
          {categoriesError && (
            <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span>{categoriesError}</span>
              <button
                type="button"
                onClick={onRetryCategories}
                disabled={categoriesLoading}
                className="inline-flex min-h-11 items-center gap-1 rounded-md border border-amber-300 bg-[var(--oh-surface-elevated)] px-2 font-semibold"
              >
                {categoriesLoading ? "Retrying…" : "Retry categories"}
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            <button
              type="button"
              onClick={() => onOpenCategory(null)}
              className={SALE_KEY_TILE_CLASS}
              style={{ backgroundColor: "var(--oh-tile-green-bg)", borderColor: "var(--oh-tile-green-border)", color: "var(--oh-tile-green-text)" }}
            >
              All products
            </button>
            {(!categoryTiles.length || categoriesError) && SALE_KEY_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onOpenQuickCategory("folder" in category ? category.folder : category.label)}
                className={SALE_KEY_TILE_CLASS}
                style={{ backgroundColor: category.bg, borderColor: category.border, color: category.color }}
              >
                {category.label}
              </button>
            ))}
            {categoryTiles.map((category, index) => {
              const tone = CATEGORY_TILE_TONES[index % CATEGORY_TILE_TONES.length];
              const label = friendlyProductName(category.name);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onOpenCategory(category.id)}
                  className={SALE_KEY_TILE_CLASS}
                  style={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.text }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {categoryTiles.length === 0 && !categoriesLoading && !categoriesError && (
            <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950">
              <p className="font-medium">No POS category keys yet</p>
              <p className="mt-1 leading-5">
                Sale Keys come from Orithos POS categories linked on products (<code className="text-[12px]">pos_categ_ids</code>).
                Assign categories in the product catalogue, then refresh this register.
              </p>
              <Link href="/products" className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--oh-orange)] underline underline-offset-2">
                Open product catalogue
              </Link>
            </div>
          )}
          <p className="mt-3 text-[13px] text-[var(--oh-muted)]">Tap a category to browse products, or search in the cart panel.</p>
        </div>
        {lineControls}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={backToCatalogHome}
          aria-label="Back to Quick Keys"
          title="Back to Quick Keys"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-[13px] font-medium text-[var(--oh-orange)] hover:bg-[var(--oh-orange-light)] lg:flex lg:w-auto lg:px-2"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          <span className="sr-only lg:not-sr-only lg:ml-1">Back to Quick Keys</span>
        </button>
        <span className="shrink-0 text-[15px] font-semibold text-[var(--oh-text)]">
          {categoryId === null
            ? query.trim()
              ? `Search: ${query.trim()}`
              : "All products"
            : friendlyProductName(posCategories.find((item) => item.id === categoryId)?.name ?? "Products")}
        </span>
        {showMobileCartButton && onViewCart && (
          <button
            type="button"
            onClick={onViewCart}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 text-xs font-semibold text-[var(--oh-text)] lg:hidden"
          >
            <ShoppingCart size={15} aria-hidden="true" />
            Cart
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 text-xs font-semibold text-[var(--oh-text)]">
            <input
              type="checkbox"
              aria-label="Hide out of stock"
              className="h-4 w-4 rounded border-[var(--oh-border)]"
              checked={hideOutOfStock}
              onChange={(event) => onHideOutOfStockChange(event.target.checked)}
            />
            <span className="lg:hidden">Hide OOS</span>
            <span className="hidden lg:inline">Hide out of stock</span>
          </label>
          <div className="inline-flex rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-0.5" role="group" aria-label="Catalogue density">
            <button
              type="button"
              aria-pressed={catalogDensity === "grid"}
              aria-label="Grid view"
              onClick={() => onCatalogDensityChange("grid")}
              className={cn("grid h-10 w-10 place-items-center rounded", catalogDensity === "grid" ? "bg-[var(--oh-surface-elevated)] text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)]")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              aria-pressed={catalogDensity === "list"}
              aria-label="List view"
              onClick={() => onCatalogDensityChange("list")}
              className={cn("grid h-10 w-10 place-items-center rounded", catalogDensity === "list" ? "bg-[var(--oh-surface-elevated)] text-[var(--oh-primary)] shadow-sm" : "text-[var(--oh-text-secondary)]")}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
      <div id="pos-product-results" className="min-h-[144px] flex-1 overflow-y-auto rounded-lg bg-[var(--sf-pad-bg)] p-3 lg:min-h-0">
        {productsLoading && !products.length ? (
          <div aria-label="Loading products" className={cn(catalogDensity === "list" ? "grid gap-2" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4")}>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className={cn("animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-muted)]", catalogDensity === "list" ? "h-16" : "min-h-36")} />
            ))}
          </div>
        ) : productsError && !products.length ? (
          <div role="alert" className="grid min-h-48 place-items-center px-5 text-center">
            <div className="max-w-sm">
              <CircleAlert size={26} className="mx-auto text-red-700" />
              <p className="mt-2 font-semibold text-[var(--oh-text)]">Products could not load</p>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">{productsError}</p>
              <button
                type="button"
                onClick={onRetryProducts}
                disabled={productsLoading}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold"
              >
                {productsLoading ? "Retrying…" : "Retry search"}
              </button>
            </div>
          </div>
        ) : products.length ? (
          <div className="flex min-h-full flex-col">
            <div
              role="listbox"
              aria-label="POS product search results"
              className={cn(catalogDensity === "list" ? "grid gap-2" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4")}
            >
              {products.map((product, index) => {
                const fullName = product.display_name || product.name;
                const label = friendlyProductName(fullName);
                const shelfPrice = shelfUnitPrice(product);
                const inStock = product.free_qty > 0;
                const disabled = !sessionOpen || !inStock || !product.available_in_pos || shelfPrice === null;
                const selected = index === productActiveIndex;
                if (catalogDensity === "list") {
                  return (
                    <button
                      key={product.id}
                      id={`pos-product-option-${product.id}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={fullName}
                      onClick={() => onAddProduct(product)}
                      disabled={disabled}
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-left shadow-sm transition-colors hover:border-[var(--oh-primary)]/45 hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-45",
                        selected && "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]",
                      )}
                    >
                      <ProductImage productId={product.id} name={label} className="h-11 w-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-orange-light)]" fallbackClassName="text-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="oh-type-body block truncate font-semibold text-[var(--oh-text)]">{label}</span>
                        <span className={cn("oh-type-label", inStock ? "text-[var(--oh-text-secondary)]" : "font-medium text-amber-800")}>
                          {inStock ? `${formatStockQty(product.free_qty)} avail.` : "No stock"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {shelfPrice === null ? (
                          <span className="oh-type-label font-semibold text-amber-800">No price</span>
                        ) : (
                          <span className="text-lg font-bold tabular-nums text-[var(--oh-text)]">{money(shelfPrice)}</span>
                        )}
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={product.id}
                    id={`pos-product-option-${product.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={fullName}
                    onClick={() => onAddProduct(product)}
                    disabled={disabled}
                    className={cn(
                      "flex min-h-[118px] flex-col rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-2.5 text-left shadow-sm transition-colors hover:border-[var(--oh-primary)]/45 hover:bg-[var(--oh-orange-light)] disabled:cursor-not-allowed disabled:opacity-45",
                      selected && "border-[var(--oh-primary)] bg-[var(--oh-orange-light)]",
                    )}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <ProductImage productId={product.id} name={label} className="h-11 w-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-orange-light)]" fallbackClassName="text-lg" />
                      {shelfPrice === null ? (
                        <span className="oh-type-label shrink-0 pt-0.5 font-semibold text-amber-800">No price</span>
                      ) : (
                        <span className="shrink-0 text-lg font-bold tabular-nums leading-none text-[var(--oh-text)]">{money(shelfPrice)}</span>
                      )}
                    </div>
                    <span className="oh-type-body line-clamp-2 font-semibold leading-5 text-[var(--oh-text)]">{label}</span>
                    {!inStock ? (
                      <span className="oh-type-label mt-auto pt-1 font-medium text-amber-800">No stock</span>
                    ) : product.free_qty <= 3 ? (
                      <span className="oh-type-label mt-auto pt-1 font-medium text-amber-800">{formatStockQty(product.free_qty)} left</span>
                    ) : (
                      <span className="mt-auto" />
                    )}
                  </button>
                );
              })}
            </div>
            {productsHasNext && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMoreProducts}
                  disabled={productsLoadingMore || productsLoading}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                >
                  {productsLoadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}
                  {productsLoadingMore ? "Loading…" : "Load more products"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center px-5 text-center text-sm text-[var(--oh-text-secondary)]">
            <div>
              <Search size={28} className="mx-auto mb-2 text-[var(--oh-border-strong)]" />
              <p className="font-medium text-[var(--oh-text)]">No products here</p>
              <p className="mt-1">
                {hideOutOfStock ? "No in-stock products match. Clear filters or show out-of-stock items." : "Search or scan a barcode to find stock."}
              </p>
              <button type="button" onClick={backToCatalogHome} className="mt-3 font-semibold text-[var(--sf-tab-blue)] underline underline-offset-2">
                Back to Quick Keys
              </button>
            </div>
          </div>
        )}
      </div>
      {lineControls}
    </div>
  );
}
