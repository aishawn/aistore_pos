export type AiEntity =
  | "product"
  | "classification"
  | "supplier"
  | "order"
  | "stocktake"
  | "stock_list"
  | "stock_more"
  | "customer"
  | "customer_group"
  | "price_list"
  | "balance"
  | "gift_card"
  | "buying_period"
  | "capped_pricing"
  | "bulk_price_edit";

export const AI_ENTITY_LIST_ROUTE: Readonly<Record<AiEntity, string>> = {
  product: "/products/odoo",
  classification: "/classifications",
  supplier: "/suppliers/odoo",
  order: "/orders",
  stocktake: "/stocktake",
  stock_list: "/stock/list",
  stock_more: "/stock/more",
  customer: "/customers/odoo",
  customer_group: "/customer-groups",
  price_list: "/pricelists",
  balance: "/customers/balances",
  gift_card: "/giftcards",
  buying_period: "/stock/buying-periods",
  capped_pricing: "/stock/capped-pricing",
  bulk_price_edit: "/stock/bulk-price-edit",
};

export function entityActionPage(entityRaw?: string | null): string | null {
  if (!entityRaw) return null;
  const entity = entityRaw.trim().toLowerCase();
  if (entity === "user" || entity === "用户" || entity === "客户") {
    return AI_ENTITY_LIST_ROUTE.customer;
  }
  return Object.prototype.hasOwnProperty.call(AI_ENTITY_LIST_ROUTE, entity)
    ? AI_ENTITY_LIST_ROUTE[entity as AiEntity]
    : null;
}

export function isReadOnlyEntityOperation(operation?: string | null): boolean {
  return /^(list|search|view|get|lookup|find|show)$/.test(
    operation?.trim().toLowerCase() ?? "",
  );
}
