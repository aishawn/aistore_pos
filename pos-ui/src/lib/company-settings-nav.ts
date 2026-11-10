/** Settings scope navigation — Company tab, Outlets tab, etc. */

export interface SettingsNavItem {
  label: string;
  href: string;
}

/** Company-scoped sub-sections (Company tab) — Shopfront-aligned. */
export const COMPANY_SETTINGS_NAV: SettingsNavItem[] = [
  { label: "General", href: "/settings/company/general" },
  { label: "General Display", href: "/settings/company/general-display" },
  { label: "Login", href: "/settings/company/login-after-sale" },
  { label: "Sell Screen / Register", href: "/settings/company/sell-screen" },
  { label: "Outlets", href: "/settings/company/outlets" },
  { label: "Date & Time", href: "/settings/company/date-time" },
  { label: "Currency", href: "/settings/company/currency" },
  { label: "Search", href: "/settings/company/search" },
  { label: "Integrations", href: "/settings/company/integrations" },
  { label: "Miscellaneous", href: "/settings/company/miscellaneous" },
];

/** Outlet-scoped sub-sections (Outlets tab). */
export const OUTLET_SETTINGS_NAV: SettingsNavItem[] = [
  { label: "Integrations", href: "/settings/outlets/integrations" },
  { label: "Gift Cards", href: "/settings/outlets/gift-cards" },
  { label: "Transfers", href: "/settings/outlets/transfers" },
  { label: "Miscellaneous", href: "/settings/outlets/miscellaneous" },
];

/** Register-scoped sub-sections (Registers tab). */
export const REGISTER_SETTINGS_NAV: SettingsNavItem[] = [
  { label: "General", href: "/settings/registers/general" },
  { label: "Sell Screen", href: "/settings/registers/sell-screen" },
  { label: "Invoices", href: "/settings/registers/invoices" },
  { label: "Miscellaneous", href: "/settings/registers/miscellaneous" },
];

export const COMPANY_SETTINGS_TABS = [
  { label: "Company", href: "/settings/company/general" },
  { label: "Staff & access", href: "/settings/staff" },
  { label: "Store", href: "/settings/registers-outlets" },
  { label: "Data", href: "/settings/data" },
  { label: "Account", href: "/settings/account" },
] as const;

export function settingsTabActive(label: string, href: string, activeHref: string) {
  if (label === "Company") {
    return activeHref.startsWith("/settings/company");
  }
  if (label === "Staff & access") {
    return activeHref.startsWith("/settings/staff") || activeHref.startsWith("/settings/users") || activeHref.startsWith("/settings/roles");
  }
  if (label === "Store") {
    return activeHref.startsWith("/settings/registers") || activeHref.startsWith("/settings/payment") || activeHref.startsWith("/settings/tax") || activeHref.startsWith("/settings/outlets");
  }
  if (label === "Data") {
    return activeHref.startsWith("/settings/data");
  }
  if (label === "Account") {
    return activeHref.startsWith("/settings/account");
  }
  return activeHref === href || activeHref.startsWith(`${href}/`);
}
