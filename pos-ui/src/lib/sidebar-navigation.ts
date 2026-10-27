/**
 * Orithos navigation — Odoo is the sole writable business source of truth.
 * Classic MySQL routes remain in the repo as reference only and are hidden
 * unless NEXT_PUBLIC_SHOW_CLASSIC_POS=true (admin debug).
 *
 * Customer sidebar (2026-10-25):
 * - Directory with groups, receivables, price lists and capability-gated gift cards.
 * - Do not confuse those Odoo routes with retired Classic MySQL pages of the same name.
 */

export interface SidebarItem {
  label: string;
  href: string;
  icon: SidebarIcon;
  /** Required permission safe_name; admins always pass. */
  permission?: string;
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
  /** Required permission safe_name; admins always pass. */
  permission?: string;
  /**
   * Extra path prefixes that keep this item active (hub entries that redirect
   * to child routes, e.g. Store → registers / payment / tax).
   */
  matchHrefs?: string[];
  anyPermissions?: string[];
}

export interface SidebarSubGroup {
  label: string;
  items: SidebarGroupItem[];
}

export interface SidebarGroup {
  label: string;
  icon: SidebarIcon;
  items: (SidebarGroupItem | SidebarSubGroup)[];
  /** If set, the whole group is hidden without this permission (when no child remains). */
  permission?: string;
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

/** Primary nav: Odoo-backed surfaces only. Dashboard follows Sell for quick access. */
export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  {
    label: "Sell",
    href: "/",
    icon: "sales",
    permission: "sell.checkout",
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "overview",
  },
  {
    label: "Stock",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products", permission: "stock.products.view" },
      {
        label: "Pricing",
        items: [
          { label: "Price Lists", href: "/pricelists", permission: "customers.pricelists" },
          { label: "Price Review", href: "/stock/price-suggestions", permission: "ai.price_suggestions" },
        ],
      },
      { label: "Purchasing", href: "/purchases", matchHrefs: ["/invoices", "/stock/replenishment"], anyPermissions: ["stock.purchases", "stock.replenishment", "stock.invoices"] },
      { label: "Suppliers", href: "/suppliers", permission: "stock.suppliers" },
    ],
  },
  {
    label: "Customers",
    icon: "customers",
    items: [
      { label: "Customer Directory", href: "/customers", matchHrefs: ["/customer-groups"], permission: "customers.view" },
      { label: "Receivables", href: "/customers/balances", permission: "customers.balances" },
      { label: "Gift Cards", href: "/giftcards", permission: "customers.gift_cards" },
    ],
  },
  {
    label: "Orithos AI",
    icon: "sommelier",
    items: [
      { label: "AI Workspace", href: "/ai", anyPermissions: ["ai.assistant", "ai.recommend", "ai.sommelier", "ai.grocery", "ai.price_suggestions"] },
      { label: "AI Assistant", href: "/assistant", permission: "ai.assistant" },
      { label: "Recommend", href: "/recommend", permission: "ai.recommend" },
      { label: "Scan Wine Label", href: "/sommelier/identify", permission: "ai.sommelier" },
    ],
  },
  {
    label: "Reports",
    href: "/reports/dashboard",
    icon: "reporting",
    permission: "reports.dashboard",
  },
  {
    label: "Setup",
    icon: "settings",
    permission: "settings.view",
    items: [
      { label: "Integrations", href: "/settings/integrations", permission: "settings.integrations" },
      { label: "Data", href: "/settings/data", permission: "settings.data" },
      // Users / Outlets / Registers tabs live inside this hub — keep the row active there.
      {
        label: "Company Settings",
        href: "/settings/company/general",
        matchHrefs: ["/settings/company", "/settings/outlets", "/settings/registers", "/settings/users"],
        permission: "settings.view",
      },
      { label: "Permissions", href: "/settings/roles", permission: "settings.permissions" },
      {
        label: "Store",
        href: "/settings/store",
        matchHrefs: ["/settings/registers-outlets", "/settings/payment", "/settings/tax"],
        permission: "settings.store",
      },
      {
        label: "Devices",
        href: "/settings/devices",
        matchHrefs: ["/settings/receipts", "/settings/hardware"],
        permission: "settings.store",
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
      { label: "Classic Sell", href: "/sell" },
      { label: "Classic Products", href: "/products" },
      { label: "Classic Customers", href: "/customers" },
    ],
  },
];

export interface SidebarNavOptions {
  /**
   * Primary store navigation. Pass `isAdmin` so admin-only ops links (e.g. AI
   * query health) stay out of cashier sidebars.
   */
  isAdmin?: boolean;
  giftCardsAvailable?: boolean;
  /** Returns true when the user may see a permission-gated item. */
  hasPermission?: (safeName: string) => boolean;
}

function allowed(
  options: SidebarNavOptions | undefined,
  permission: string | undefined,
  adminOnly?: boolean,
) {
  const isAdmin = options?.isAdmin === true;
  if (adminOnly && !isAdmin) return false;
  if (!permission) return true;
  if (isAdmin) return true;
  return options?.hasPermission?.(permission) === true;
}

/**
 * Primary store navigation. Pass `isAdmin` so admin-only ops links (e.g. AI
 * query health) stay out of cashier sidebars.
 */
export function getSidebarNavigation(options?: SidebarNavOptions): (SidebarItem | SidebarGroup)[] {
  const showClassic = process.env.NEXT_PUBLIC_SHOW_CLASSIC_POS === "true";
  const main = SIDEBAR_MAIN.flatMap<SidebarItem | SidebarGroup>((entry) => {
    if ("items" in entry) {
      if (!allowed(options, entry.permission)) return [];
      const items = entry.items.flatMap((item) => {
        if ("items" in item) {
          const children = item.items.filter((child) => allowed(options, child.permission, child.adminOnly) && (!child.anyPermissions || child.anyPermissions.some((permission) => allowed(options, permission))));
          return children.length ? [{ ...item, items: children }] : [];
        }
        if (item.href === "/giftcards" && options?.giftCardsAvailable !== true) return [];
        if (!allowed(options, item.permission, item.adminOnly)) return [];
        if (item.anyPermissions && !item.anyPermissions.some((permission) => allowed(options, permission))) return [];
        return [item];
      });
      if (items.length === 0) return [];
      return [{ ...entry, items }];
    }
    if (!allowed(options, entry.permission)) return [];
    return [entry];
  });
  return showClassic ? [...main, ...SIDEBAR_CLASSIC_DEBUG] : main;
}
