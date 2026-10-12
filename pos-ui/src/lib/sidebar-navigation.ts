/**
 * Orithos navigation follows the Shopfront retail workflow while keeping our
 * own labels and AI tools. Keep the high-frequency register actions first;
 * group back-office pages by the job users are trying to complete.
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

export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  {
    label: "Register",
    icon: "sales",
    items: [
      { label: "Sell", href: "/" },
      { label: "Classic POS (MySQL)", href: "/register/classic" },
      { label: "Sales History", href: "/history/odoo" },
      { label: "Classic Sales (MySQL)", href: "/history" },
      { label: "Manage Cash", href: "/manage-cash" },
      { label: "Close Register", href: "/close" },
    ],
  },
  {
    label: "Stock Management",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products/odoo" },
      { label: "Classic Products (MySQL)", href: "/products" },
      { label: "Classic Stock List (MySQL)", href: "/stock/list" },
      { label: "Replenishment Plan (Odoo)", href: "/stock/replenishment" },
      { label: "Purchases (Odoo)", href: "/purchases/odoo" },
      { label: "Classic Suppliers (MySQL)", href: "/suppliers" },
      { label: "Classic Orders (MySQL)", href: "/orders" },
      { label: "Classic Stocktake (MySQL)", href: "/stocktake" },
      { label: "Classic Stock Tools (MySQL)", href: "/stock/more", more: true },
    ],
  },
  {
    label: "Customer Management",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers/odoo" },
      { label: "Classic Customers (MySQL)", href: "/customers" },
      { label: "Classic Customer Groups (MySQL)", href: "/customer-groups" },
      { label: "Classic Balances (MySQL)", href: "/customers/balances" },
      { label: "Classic Gift Cards (MySQL)", href: "/giftcards" },
    ],
  },
  {
    label: "Marketing",
    icon: "marketing",
    items: [
      { label: "Classic Promotions (MySQL)", href: "/promotions" },
      { label: "Classic Price Lists (MySQL)", href: "/pricelists" },
      { label: "Classic Promotion Categories (MySQL)", href: "/promotion/categories" },
    ],
  },
  {
    label: "Reporting",
    icon: "reporting",
    items: [
      { label: "Reporting Dashboard", href: "/reports/dashboard" },
      { label: "Classic Sales Reports (MySQL)", href: "/reports/sales" },
      { label: "Classic Inventory Reports (MySQL)", href: "/reports/inventory" },
      { label: "Classic Purchase Reports (MySQL)", href: "/reports/purchase" },
      { label: "Classic Closures (MySQL)", href: "/reports/closures" },
      { label: "Classic Reports (MySQL)", href: "/reports/misc", more: true },
    ],
  },
  {
    label: "Orithos AI",
    icon: "sommelier",
    items: [
      { label: "Wine Assistant", href: "/sommelier" },
      { label: "Find a Wine", href: "/sommelier/find" },
      { label: "Identify Wine Label", href: "/sommelier/identify" },
      { label: "Scan Supplier Invoice", href: "/invoices/scan" },
    ],
  },
  {
    label: "Setup",
    icon: "settings",
    items: [
      { label: "Company Settings", href: "/settings/company/general" },
      { label: "Users", href: "/settings/users" },
      { label: "Roles & Permissions", href: "/settings/roles" },
      { label: "Registers & Outlets", href: "/settings/registers-outlets" },
      { label: "Sale Keys", href: "/settings/keys" },
      { label: "Payment Methods", href: "/settings/payment" },
      { label: "Tax Rates", href: "/settings/tax" },
      { label: "Receipts", href: "/settings/receipts" },
      { label: "Hardware", href: "/settings/hardware" },
      { label: "Integrations", href: "/settings/integrations" },
      { label: "More Settings", href: "/settings", more: true },
    ],
  },
];
