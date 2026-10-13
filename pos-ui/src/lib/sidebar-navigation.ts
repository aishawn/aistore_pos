/**
 * Orithos navigation — Odoo is the sole writable business source of truth.
 * Classic MySQL routes remain in the repo as reference only and are hidden
 * unless NEXT_PUBLIC_SHOW_CLASSIC_POS=true (admin debug).
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
}

export interface SidebarGroup {
  label: string;
  icon: SidebarIcon;
  items: SidebarGroupItem[];
}

export type SidebarIcon =
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
    label: "Register",
    icon: "sales",
    items: [
      { label: "Sell", href: "/" },
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
      { label: "Purchases", href: "/purchases/odoo" },
      { label: "Suppliers", href: "/suppliers/odoo" },
    ],
  },
  {
    label: "Customers",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers/odoo" },
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
      { label: "Replenishment Plan", href: "/stock/replenishment" },
      { label: "Scan Supplier Invoice", href: "/invoices/scan" },
      { label: "Wine Assistant", href: "/sommelier" },
      { label: "Find a Wine", href: "/sommelier/find" },
      { label: "Identify Wine Label", href: "/sommelier/identify" },
    ],
  },
  {
    label: "Setup",
    icon: "settings",
    items: [
      { label: "Integrations", href: "/settings/integrations" },
      { label: "Company Settings", href: "/settings/company/general" },
      { label: "Users", href: "/settings/users" },
      { label: "Roles & Permissions", href: "/settings/roles" },
      { label: "Registers & Outlets", href: "/settings/registers-outlets" },
      { label: "Sale Keys", href: "/settings/keys" },
      { label: "Payment Methods", href: "/settings/payment" },
      { label: "Tax Rates", href: "/settings/tax" },
      { label: "Receipts", href: "/settings/receipts" },
      { label: "Hardware", href: "/settings/hardware" },
      { label: "More Settings", href: "/settings", more: true },
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
