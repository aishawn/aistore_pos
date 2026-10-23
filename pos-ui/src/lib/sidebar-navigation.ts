/**
 * Orithos navigation — Odoo is the sole writable business source of truth.
 * Classic MySQL routes remain in the repo as reference only and are hidden
 * unless NEXT_PUBLIC_SHOW_CLASSIC_POS=true (admin debug).
 *
 * Customer sidebar (2026-10-23):
 * - Odoo-backed children: Customers, Groups, Price Lists, Balances, Gift Cards.
 * - Do not confuse those Odoo routes with retired Classic MySQL pages of the same name.
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
  /** One-line description shown under the label (hover title). */
  hint?: string;
  /** Hidden from the sidebar unless the signed-in user is a store admin. */
  adminOnly?: boolean;
  /**
   * Extra path prefixes that keep this item active (hub entries that redirect
   * to child routes, e.g. Store → registers / payment / tax).
   */
  matchHrefs?: string[];
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

/** Primary nav: Odoo-backed surfaces only. Sell first; Overview just above Setup. */
export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  {
    label: "Sell",
    href: "/",
    icon: "sales",
  },
  {
    label: "Stock",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products/odoo" },
      { label: "Replenishment", href: "/stock/replenishment" },
      { label: "Purchases", href: "/purchases/odoo" },
      { label: "Invoices", href: "/invoices", matchHrefs: ["/invoices/"] },
      { label: "Suppliers", href: "/suppliers/odoo" },
    ],
  },
  {
    label: "Customers",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers/odoo" },
      { label: "Groups", href: "/customer-groups" },
      { label: "Price Lists", href: "/pricelists" },
      { label: "Balances", href: "/customers/balances" },
      { label: "Gift Cards", href: "/giftcards" },
    ],
  },
  {
    label: "Orithos AI",
    icon: "sommelier",
    items: [
      { label: "AI Assistant", href: "/assistant" },
      { label: "Recommend", href: "/recommend" },
      { label: "Find a Wine", href: "/sommelier/find" },
      { label: "Identify Wine Label", href: "/sommelier/identify" },
      { label: "Find Grocery", href: "/recommend/grocery" },
      { label: "Price Suggestions", href: "/stock/price-suggestions" },
    ],
  },
  {
    label: "Overview",
    href: "/overview",
    icon: "overview",
  },
  {
    label: "Reports",
    href: "/reports/dashboard",
    icon: "reporting",
  },
  {
    label: "Setup",
    icon: "settings",
    items: [
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Data", href: "/settings/data" },
      // Users / Outlets / Registers tabs live inside this hub — keep the row active there.
      {
        label: "Company Settings",
        href: "/settings/company/general",
        matchHrefs: ["/settings/company", "/settings/outlets", "/settings/registers", "/settings/users"],
      },
      { label: "Roles & Permissions", href: "/settings/roles" },
      {
        label: "Store",
        href: "/settings/store",
        matchHrefs: ["/settings/registers-outlets", "/settings/payment", "/settings/tax"],
      },
      {
        label: "Devices",
        href: "/settings/devices",
        matchHrefs: ["/settings/receipts", "/settings/hardware"],
      },
      { label: "Account", href: "/settings/account" },
      // Ops health for store admins — not a cashier / Q&A quality surface.
      {
        label: "AI Query Health",
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
