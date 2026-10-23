/**
 * DEPRECATED — not imported by the live Sidebar.
 * Live nav: `pos-ui/src/lib/sidebar-navigation.ts` (Odoo-backed Customers only).
 *
 * This Shopfront-era five-item Customer section (Groups / Price Lists / Balances /
 * Gift Cards) must not be restored into SIDEBAR_MAIN. Classic routes remain
 * reference-only until each has an Odoo-backed replacement.
 */

export interface SidebarItem {
  label: string;
  href: string;
  icon: SidebarIcon;
}

export interface SidebarGroupItem {
  label: string;
  href: string;
  more?: boolean;
}

export interface SidebarGroup {
  label: string;
  icon: SidebarIcon;
  items: SidebarGroupItem[];
}

export type SidebarIcon =
  | "sales"
  | "inventory"
  | "customers"
  | "reporting"
  | "settings";

export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  { label: "Sell", href: "/", icon: "sales" },
  {
    label: "Inventory",
    icon: "inventory",
    items: [
      { label: "Products", href: "/products" },
      { label: "Classifications", href: "/classifications" },
      { label: "Suppliers", href: "/suppliers" },
      { label: "Orders & Invoices", href: "/orders" },
      { label: "Stocktake", href: "/stocktake" },
      { label: "More", href: "/stock/more", more: true },
    ],
  },
  {
    label: "Customer",
    icon: "customers",
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Groups", href: "/customer-groups" },
      { label: "Price Lists", href: "/pricelists" },
      { label: "Balances", href: "/customers/balances" },
      { label: "Gift Cards", href: "/giftcards" },
    ],
  },
  {
    label: "Reporting",
    icon: "reporting",
    items: [
      { label: "Daily Sales", href: "/reports/daily-sales" },
      { label: "Weekly Sales", href: "/reports/weekly-sales" },
      { label: "Last Week Sales", href: "/reports/last-week-sales" },
      { label: "This Month Sales", href: "/reports/this-month-sales" },
      { label: "Last Month Sales", href: "/reports/last-month-sales" },
    ],
  },
  { label: "Settings", href: "/settings", icon: "settings" },
];
