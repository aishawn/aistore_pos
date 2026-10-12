import type { SaleKey } from "@/types/orithos";

/** Actions available when a sale key is tapped on the Sell screen. */
export interface SaleKeyHandler {
  addQuickKey: (key: string) => void;
  addCatalogProduct: (productId: number) => void;
  incQty: (amount?: number) => void;
  decQty: () => void;
  requestClear: () => void;
  startPayment: (method: "EFTPOS VISA MasterCard" | "Exact Cash" | "Eftpos Cash Out") => void;
  applyCaseQuantity: () => void;
  runAction: (name: string) => void;
  returnSelectedItem: () => void;
  openDiscountDialog: () => void;
  openProducts: (folder?: string) => void;
  openPromotions?: () => void;
  onOpenMoreActions?: () => void;
}

const PRODUCT_FOLDER_KEYS: Record<string, string> = {
  beer: "Beer",
  wines: "Wines",
  "red-wine": "Wines",
  spirits: "Spirits",
  products: "Products",
  others: "Products",
  "soft-drink": "Products",
};

export function saleKeyLabel(key: SaleKey): string {
  return key.label ?? key.id;
}

/** Product name a sale key should sell. The visible label is the catalogue name. */
export function saleKeyProductQuery(key: SaleKey): string {
  const label = key.label?.trim();
  return label || key.id;
}

export function isSaleKeyDisabled(keyId: string, cartEmpty: boolean): boolean {
  return (
    cartEmpty &&
    (keyId === "plus-quantity" ||
      keyId === "minus-quantity" ||
      keyId === "clear-sale" ||
      keyId === "case-quantity")
  );
}

export function activateSaleKey(key: SaleKey, sell: SaleKeyHandler, cartEmpty: boolean): void {
  if (isSaleKeyDisabled(key.id, cartEmpty)) return;

  switch (key.id) {
    case "plus-quantity":
      sell.incQty();
      return;
    case "minus-quantity":
      sell.decQty();
      return;
    case "clear-sale":
      sell.requestClear();
      return;
    case "more-functions":
      sell.onOpenMoreActions?.();
      return;
    case "eftpos":
      sell.startPayment("EFTPOS VISA MasterCard");
      return;
    case "exact-cash":
      sell.startPayment("Exact Cash");
      return;
    case "cash-out":
      sell.startPayment("Eftpos Cash Out");
      return;
    case "case-quantity":
      sell.applyCaseQuantity();
      return;
    case "return-product":
      sell.returnSelectedItem();
      return;
    case "discount":
      sell.openDiscountDialog();
      return;
    case "promotions":
      sell.openPromotions?.();
      return;
    default: {
      const folder = PRODUCT_FOLDER_KEYS[key.id];
      if (folder) {
        sell.openProducts(folder);
        return;
      }
      if (key.productId != null && key.productId > 0) {
        sell.addCatalogProduct(key.productId);
        return;
      }
      sell.addQuickKey(saleKeyProductQuery(key));
    }
  }
}
