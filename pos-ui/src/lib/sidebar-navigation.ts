/**
 * Orithos navigation — Orithos PostgreSQL is the sole live business ledger.
 * Classic MySQL routes remain in the repo as reference only and are hidden
 * unless NEXT_PUBLIC_SHOW_CLASSIC_POS=true (admin debug).
 *
 * Customer sidebar:
 * - Directory, balances, capability-gated gift cards, and Orithos pricelists.
 * - Legacy `/…/odoo` paths are redirects only; do not revive Classic MySQL pages.
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

/** Primary nav: Odoo-backed surfaces only. Dashboard sits above Setup. */
export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  {
    label: "Sell",
    href: "/",
    icon: "sales",
    permission: "sell.checkout",
  },
  {
    label: "Stock",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products", permission: "stock.products.view" },
      { label: "Purchasing", href: "/purchases", matchHrefs: ["/invoices", "/stock/replenishment"], anyPermissions: ["stock.purchases", "stock.replenishment", "stock.invoices", "stock.suppliers"] },
    ],
  },
  {
    label: "Customers",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers", permission: "customers.view" },
      { label: "Balances", href: "/customers/balances", permission: "customers.balances" },
      { label: "Gift Cards", href: "/giftcards", permission: "customers.gift_cards" },
      { label: "Pricelists", href: "/pricelists", permission: "customers.pricelists" },
    ],
  },
  {
    label: "Orithos AI",
    icon: "sommelier",
    items: [
      { label: "AI Workspace", href: "/ai", anyPermissions: ["ai.assistant", "ai.recommend", "ai.sommelier", "ai.grocery", "ai.price_suggestions"] },
      { label: "AI Assistant", href: "/assistant", permission: "ai.assistant" },
    ],
  },
  {
    label: "Reports",
    href: "/reports/dashboard",
    icon: "reporting",
    permission: "reports.dashboard",
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "overview",
  },
  {
    label: "Setup",
    icon: "settings",
    permission: "settings.view",
    items: [
      { label: "General", href: "/settings/company/general", permission: "settings.view", matchHrefs: ["/settings/company"] },
      { label: "Account & Billing", href: "/settings/account", permission: "settings.view" },
      { label: "Data", href: "/settings/data", permission: "settings.data" },
      { label: "Sale Keys", href: "/settings/keys", permission: "settings.view" },
      { label: "Receipts", href: "/settings/receipts", permission: "settings.view" },
      { label: "Statements", href: "/settings/statements", permission: "settings.view" },
      { label: "Payment Methods", href: "/settings/payment", permission: "settings.view" },
      { label: "Tax Rates", href: "/settings/tax", permission: "settings.view" },
      { label: "Transfer List", href: "/settings/transferees", permission: "settings.view" },
      { label: "Customer Display", href: "/settings/customerdisplay", permission: "settings.view" },
      { label: "Users", href: "/settings/users", permission: "settings.users" },
      { label: "Roles & Permissions", href: "/settings/roles", permission: "settings.permissions" },
      { label: "Loyalty", href: "/settings/loyalty", permission: "settings.view" },
      { label: "Surcharging", href: "/settings/surcharging", permission: "settings.view" },
      { label: "Hardware", href: "/settings/hardware", permission: "settings.view" },
      { label: "Additional Information", href: "/settings/additional-information", permission: "settings.view" },
      { label: "Page Rules", href: "/settings/rules", permission: "settings.view" },
      { label: "Integrations", href: "/settings/integrations", permission: "settings.integrations" },
      { label: "Push Notifications", href: "/settings/push", permission: "settings.view" },
      { label: "Promotion Categories", href: "/settings/promotion-categories", permission: "settings.view" },
      { label: "Barcode Templates", href: "/settings/barcodes", permission: "settings.view" },
      { label: "Price Sets", href: "/settings/pricesets", permission: "settings.view" },
      { label: "Registers & Outlets", href: "/settings/registers-outlets", permission: "settings.view", matchHrefs: ["/settings/registers", "/settings/outlets"] },
      { label: "Enterprise Policies", href: "/enterprise", permission: "settings.store" },
      {
        label: "AI Health",
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

function isSidebarSubGroup(item: SidebarGroupItem | SidebarSubGroup): item is SidebarSubGroup {
  return "items" in item;
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
      const items: (SidebarGroupItem | SidebarSubGroup)[] = entry.items.flatMap((item): (SidebarGroupItem | SidebarSubGroup)[] => {
        if (isSidebarSubGroup(item)) {
          const children = item.items.filter((child) => allowed(options, child.permission, child.adminOnly) && (!child.anyPermissions || child.anyPermissions.some((permission) => allowed(options, permission))));
          return children.length ? [{ ...item, items: children } as SidebarSubGroup] : [];
        }
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
