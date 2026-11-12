/**
 * DEPRECATED — not imported by the live Sidebar.
 * Live nav: `pos-ui/src/lib/sidebar-navigation.ts`.
 *
 * Historic Shopfront-era Customer labels live here for reference only.
 * Live Customers now includes Pricelists via `/pricelists` (Orithos-backed).
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
