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
  /** Hidden from the sidebar unless the signed-in user is a store admin. */
  adminOnly?: boolean;
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
      { label: "Replenishment", href: "/stock/replenishment" },
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
      { label: "Wine Assistant", href: "/sommelier" },
      { label: "Find a Wine", href: "/sommelier/find" },
      { label: "Identify Wine Label", href: "/sommelier/identify" },
      { label: "Price Suggestions", href: "/stock/price-suggestions" },
      { label: "Scan Supplier Invoice", href: "/invoices/scan" },
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
      // Ops health for store admins — not a cashier / Q&A quality surface.
      {
        label: "AI query health",
        href: "/reports/ai/metrics",
        adminOnly: true,
        hint: "Admin-only volume, latency, and guard rates",
      },
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

function isSidebarGroup(entry: SidebarItem | SidebarGroup): entry is SidebarGroup {
  return "items" in entry;
}

/**
 * Primary store navigation. Pass `isAdmin` so admin-only ops links (e.g. AI
 * query health) stay out of cashier sidebars.
 */
export function getSidebarNavigation(options?: {
  isAdmin?: boolean;
}): (SidebarItem | SidebarGroup)[] {
  const showClassic =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SHOW_CLASSIC_POS === "true";
  const base = showClassic ? [...SIDEBAR_MAIN, ...SIDEBAR_CLASSIC_DEBUG] : SIDEBAR_MAIN;
  const isAdmin = options?.isAdmin === true;
  return base
    .map((entry) => {
      if (!isSidebarGroup(entry)) return entry;
      return {
        ...entry,
        items: entry.items.filter((item) => !item.adminOnly || isAdmin),
      };
    })
    .filter((entry) => !isSidebarGroup(entry) || entry.items.length > 0);
}
