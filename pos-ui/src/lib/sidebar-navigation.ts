/**
 * Orithos navigation — Odoo is the sole writable business source of truth.
 * Classic MySQL routes remain in the repo as reference only and are hidden
 * unless NEXT_PUBLIC_SHOW_CLASSIC_POS=true (admin debug).
 *
 * Customer sidebar hybrid (2026-10-22):
 * - Keep the collapsible Customers group (Shopfront-style IA).
 * - Only list Odoo-backed, accepted surfaces in SIDEBAR_MAIN.
 * - Do NOT restore Classic Customer Groups / Price Lists / Balances / Gift Cards
 *   into production nav. Those routes stay orphaned or debug-only until each has
 *   an Odoo-backed replacement.
 * - Pilot phase order (Balances / Gift Cards not required soon): deepen Customers
 *   directory → Odoo Price Lists view/assign → Odoo Groups (tags/categories) →
 *   Balances (AR) → Gift Cards. Add a sidebar child only when that surface ships.
 */

export interface SidebarItem {
  label: string;
  href: string;
  icon: SidebarIcon;
}

export interface SidebarGroupItem {
  label: string;
  href: string;
  /** Renders as "+ More" for expandable module hubs. */
  more?: boolean;
  /** One-line description shown under the label. */
  hint?: string;
}

export interface SidebarGroup {
  label: string;
  icon: SidebarIcon;
  items: SidebarGroupItem[];
}

export type SidebarIcon =
  | "overview"
  | "sales"
  | "sommelier"
  | "invoice"
  | "inventory"
  | "customers"
  | "reporting"
  | "settings"
  | "marketing";

/** Primary nav: Odoo-backed surfaces only. */
export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  {
    label: "Overview",
    href: "/overview",
    icon: "overview",
  },
  {
    label: "Register",
    icon: "sales",
    items: [
      { label: "Point of sale", href: "/" },
      { label: "Sales History", href: "/history/odoo" },
      { label: "Close Register", href: "/close" },
    ],
  },
  {
    label: "Stock",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products/odoo" },
      { label: "Replenishment Plan", href: "/stock/replenishment" },
      { label: "Price Suggestions", href: "/stock/price-suggestions" },
      { label: "Purchases", href: "/purchases/odoo" },
      { label: "Suppliers", href: "/suppliers/odoo" },
    ],
  },
  {
    // Collapsible group kept for future Odoo children; one honest child for now.
    label: "Customers",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers/odoo" },
      // Future (Odoo-backed only — do not wire Classic stubs):
      // Customer Groups → Odoo tags/categories
      // Price Lists → Odoo pricelist view/assign (checkout already uses _get_product_price)
      // Balances → Odoo AR (keep /customers/balances stub out of nav until live)
      // Gift Cards → only after a real Odoo/product decision
    ],
  },
  {
    label: "Reporting",
    icon: "reporting",
    items: [
      { label: "Reporting Dashboard", href: "/reports/dashboard" },
    ],
  },
  {
    label: "Orithos AI",
    icon: "sommelier",
    items: [
      { label: "Wine Assistant", href: "/sommelier", hint: "Find a wine or identify a label" },
      { label: "Find a Wine", href: "/sommelier/find", hint: "Recommend in-stock bottles by budget and taste" },
      { label: "Identify Wine Label", href: "/sommelier/identify", hint: "Search by name, barcode, or label photo" },
      { label: "Price Suggestions", href: "/stock/price-suggestions", hint: "Suggested shelf prices. You apply changes" },
      { label: "Scan Supplier Invoice", href: "/invoices/scan", hint: "Preview only. Does not create a purchase" },
      { label: "AI Report Metrics", href: "/reports/ai/metrics", hint: "Admin-only query health and latency" },
    ],
  },
  {
    label: "Setup",
    icon: "settings",
    items: [
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Data", href: "/settings/data" },
      { label: "Company Settings", href: "/settings/company/general" },
      { label: "Users", href: "/settings/users" },
      { label: "Roles & Permissions", href: "/settings/roles" },
      { label: "Registers & Outlets", href: "/settings/registers-outlets" },
      { label: "Payment Methods", href: "/settings/payment" },
      { label: "Tax Rates", href: "/settings/tax" },
      { label: "Receipts", href: "/settings/receipts" },
      { label: "Hardware", href: "/settings/hardware" },
      { label: "Account", href: "/settings/account" },
    ],
  },
];

/** Debug-only Classic (MySQL) routes — not shown in production pilot UI. */
export const SIDEBAR_CLASSIC_DEBUG: SidebarGroup[] = [
  {
    label: "Classic (MySQL reference)",
    icon: "settings",
    items: [
      { label: "Classic POS", href: "/register/classic" },
      { label: "Classic Sales", href: "/history" },
      { label: "Classic Products", href: "/products" },
      { label: "Classic Stock", href: "/stock/list" },
      { label: "Classic Orders", href: "/orders" },
      { label: "Classic Customers", href: "/customers" },
      { label: "Classic Reports", href: "/reports/sales" },
    ],
  },
];

export function getSidebarNavigation(): (SidebarItem | SidebarGroup)[] {
  const showClassic =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SHOW_CLASSIC_POS === "true";
  if (!showClassic) return SIDEBAR_MAIN;
  return [...SIDEBAR_MAIN, ...SIDEBAR_CLASSIC_DEBUG];
}
