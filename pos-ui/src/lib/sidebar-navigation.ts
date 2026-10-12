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
      { label: "Odoo POS", href: "/register/odoo" },
      { label: "Sales History", href: "/history" },
      { label: "Odoo Sales", href: "/history/odoo" },
      { label: "Manage Cash", href: "/manage-cash" },
      { label: "Close Register", href: "/close" },
    ],
  },
  {
    label: "Stock Management",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products" },
      { label: "Odoo Product Catalogue", href: "/products/odoo" },
      { label: "Stock List", href: "/stock/list" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Orders & Invoices", href: "/orders" },
      { label: "Stocktake", href: "/stocktake" },
      { label: "More", href: "/stock/more", more: true },
    ],
  },
  {
    label: "Customer Management",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Customer Groups", href: "/customer-groups" },
      { label: "Balances", href: "/customers/balances" },
      { label: "Gift Cards", href: "/giftcards" },
    ],
  },
  {
    label: "Marketing",
    icon: "marketing",
    items: [
      { label: "Promotions", href: "/promotions" },
      { label: "Price Lists", href: "/pricelists" },
      { label: "Promotion Categories", href: "/promotion/categories" },
    ],
  },
  {
    label: "Reporting",
    icon: "reporting",
    items: [
      { label: "Sales Reports", href: "/reports/sales" },
      { label: "Inventory", href: "/reports/inventory" },
      { label: "Purchases", href: "/reports/purchase" },
      { label: "Register Closures", href: "/reports/closures" },
      { label: "Dashboard", href: "/reports/dashboard" },
      { label: "More Reports", href: "/reports/misc", more: true },
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
