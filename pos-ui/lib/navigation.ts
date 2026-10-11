import type { NavEntry } from "@/types/navigation";

/**
 * Full Orithos "Sell" app navigation, extracted verbatim from the live
 * hamburger drawer at sea.onorithos.com (labels + hrefs + grouping).
 */
export const NAVIGATION: NavEntry[] = [
  { kind: "item", item: { label: "Sell", href: "/" } },
  { kind: "item", item: { label: "Dashboard", href: "/dashboard" } },
  {
    kind: "group",
    group: {
      label: "Register",
      items: [
        { label: "Manage Cash", href: "/manage-cash" },
        { label: "Close Register", href: "/close" },
        { label: "Sales History", href: "/history" },
      ],
    },
  },
  {
    kind: "group",
    group: {
      label: "Stock Management",
      items: [
        { label: "Products", href: "/products" },
        { label: "Classifications", href: "/classifications" },
        { label: "Suppliers", href: "/suppliers" },
        { label: "Orders & Invoices", href: "/orders" },
        { label: "Stocktake", href: "/stocktake" },
        { label: "More", href: "/stock/more" },
      ],
    },
  },
  {
    kind: "group",
    group: {
      label: "Customer Management",
      items: [
        { label: "Customers", href: "/customers" },
        { label: "Customer Groups", href: "/customer-groups" },
        { label: "Price Lists", href: "/pricelists" },
        { label: "Balances", href: "/customers/balances" },
        { label: "Gift Cards", href: "/giftcards" },
      ],
    },
  },
  {
    kind: "group",
    group: {
      label: "Marketing",
      items: [
        { label: "Promotions", href: "/promotions" },
        { label: "Shelf Tickets", href: "/tickets" },
        { label: "Media Centre", href: "/media" },
      ],
    },
  },
  {
    kind: "group",
    group: {
      label: "Reporting",
      items: [
        { label: "Security Centre", href: "/security" },
        { label: "Daily Sales", href: "/reports/daily-sales" },
        { label: "Weekly Sales", href: "/reports/weekly-sales" },
        { label: "Last Week Sales", href: "/reports/last-week-sales" },
        { label: "This Month Sales", href: "/reports/this-month-sales" },
        { label: "Last Month Sales", href: "/reports/last-month-sales" },
        { label: "Purchase Reports", href: "/reports/purchase" },
        { label: "Transfer Reports", href: "/reports/transfer" },
        { label: "Actions Reports", href: "/reports/actions" },
        { label: "Advanced Reports", href: "/reports/advanced" },
        { label: "Favourite Reports", href: "/reports/favourites" },
        { label: "Miscellaneous Reports", href: "/reports/misc" },
      ],
    },
  },
  {
    kind: "group",
    group: {
      label: "Setup",
      items: [
        { label: "General", href: "/settings" },
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
  },
  {
    kind: "group",
    group: {
      label: "Utilities",
      items: [
        { label: "Future Prices", href: "/utilities/future-prices" },
        { label: "Future Costs", href: "/utilities/future-costs" },
        { label: "Mail Log", href: "/utilities/mail-log" },
        { label: "Vendor Connections", href: "/utilities/vendor-connections" },
        { label: "Trashed Items", href: "/utilities/trashed-items" },
        { label: "Barcodes", href: "/utilities/barcodes" },
        { label: "Product Utilities", href: "/utilities/products" },
        { label: "Customer Utilities", href: "/utilities/customers" },
      ],
    },
  },
  {
    kind: "item",
    item: { label: "Help", href: "https://support.onorithos.com", external: true },
  },
];

/** Flat list of all internal routes (for stub generation / sitemap). */
export const ALL_ROUTES: { label: string; href: string }[] = NAVIGATION.flatMap(
  (entry) =>
    entry.kind === "item"
      ? entry.item.external
        ? []
        : [{ label: entry.item.label, href: entry.item.href }]
      : entry.group.items.map((i) => ({ label: i.label, href: i.href })),
);
