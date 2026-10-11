"use client";

import { useEffect } from "react";
import { useSellScreen } from "@/lib/sell-screen";

/** Demo sale items matching the reference mockup ($245.90 grand total). */
export const DEMO_SALE_ITEMS = [
  { id: "bananas", name: "Organic Bananas", unitPrice: 4.5, qty: 2 },
  { id: "bread", name: "Artisan Bread", unitPrice: 8.5, qty: 1 },
  { id: "detergent", name: "Laundry Detergent", unitPrice: 18.0, qty: 1 },
  { id: "shiraz", name: "Penfolds Shiraz", unitPrice: 89.0, qty: 1 },
  { id: "peroni", name: "Peroni Lager", unitPrice: 12.8, qty: 3 },
  { id: "vodka", name: "Smirnoff Vodka 700ml", unitPrice: 42.0, qty: 1 },
  { id: "cheese", name: "Artisan Cheese", unitPrice: 15.0, qty: 1 },
  { id: "craft-beer", name: "Craft Beer 4pk", unitPrice: 13.0, qty: 2 },
] as const;

/** Seeds the reference demo transaction when the cart is empty. */
export function DemoSaleLoader() {
  const sell = useSellScreen();

  useEffect(() => {
    if (sell.lines.length > 0) return;
    for (const item of DEMO_SALE_ITEMS) {
      sell.addProduct({ id: item.id, name: item.name, unitPrice: item.unitPrice });
      if (item.qty > 1) {
        for (let i = 1; i < item.qty; i++) {
          sell.addProduct({ id: item.id, name: item.name, unitPrice: item.unitPrice });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
