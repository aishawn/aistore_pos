/** Orithos persistent sidebar navigation — simplified from Shopfront feature set. */

export interface SidebarItem {
  label: string;
  href: string;
  icon: SidebarIcon;
}

export interface SidebarGroupItem {
  label: string;
  href: string;
  /** Renders as "+ More" with a plus icon (Stock Management hub). */
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
  | "settings";

export const SIDEBAR_MAIN: (SidebarItem | SidebarGroup)[] = [
  { label: "Sell", href: "/", icon: "sales" },
  { label: "Sommelier", href: "/sommelier", icon: "sommelier" },
  { label: "Scan Invoice", href: "/invoices/scan", icon: "invoice" },
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
      { label: "Customer Groups", href: "/customer-groups" },
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
  {
    label: "Settings",
    icon: "settings",
    items: [
      { label: "General", href: "/settings/company/general" },
      { label: "Account & Billing", href: "/settings/account" },
      { label: "Sale Keys", href: "/settings/keys" },
      { label: "Statements", href: "/settings/statements" },
      { label: "Payment Methods", href: "/settings/payment" },
      { label: "Tax Rates", href: "/settings/tax" },
      { label: "Customer Display", href: "/settings/customerdisplay" },
      { label: "Surcharging", href: "/settings/surcharging" },
      { label: "Hardware", href: "/settings/hardware" },
      { label: "Barcode Templates", href: "/settings/barcodes" },
      { label: "Price Sets", href: "/settings/pricesets" },
      { label: "Registers & Outlets", href: "/settings/registers-outlets" },
      { label: "Enterprise Policies", href: "/enterprise" },
    ],
  },
];
