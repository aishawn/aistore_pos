/** Shopfront-aligned company KV field definitions for Orithos Settings UI. */

export type CompanyFieldType = "text" | "number" | "boolean" | "select" | "json" | "string-list";

export type CompanyField = {
  key: string;
  label: string;
  description?: string;
  type: CompanyFieldType;
  options?: { value: string; label: string }[];
};

const runtimeSettings = new Set([
  "company.general.use_quantity_rate",
  "company.general.family_price_distribution",
  "company.general.price_rounding_mode",
  "company.name",
  "company.abn",
  "company.street",
  "company.city",
  "company.zip",
  "company.phone",
  "company.email",
  "company.login.require_password",
  "company.sell.discounts_require_reason",
  "company.sell.refunds_require_reason",
  "company.sell.allow_cash_out_without_sale",
  "company.sell.require_note_on_parked_sale",
  "company.sell.cash_in_reasons",
  "company.sell.cash_out_reasons",
  "company.misc.sale_keys_position",
  "company.timezone",
  "company.date_format",
  "company.time_format",
  "company.start_of_week",
  "company.currency.round_to",
]);

export function isCompanySettingRuntimeSupported(key: string): boolean {
  return runtimeSettings.has(key);
}

export type CompanySection = {
  id: string;
  title: string;
  href: string;
  fields: CompanyField[];
};

export const COMPANY_SECTIONS: CompanySection[] = [
  {
    id: "general",
    title: "General",
    href: "/settings/company/general",
    fields: [
      { key: "company.general.use_quantity_rate", label: "Quantity Pricing Method", type: "select", options: [
        { value: "HIGH_MIX_PRICE", label: "High Mix Price" },
        { value: "QUANTITY_RATE", label: "Quantity Rate" },
        { value: "LOW_MIX_PRICE", label: "Low Mix Price" },
        { value: "AVERAGE", label: "Average" },
      ]},
      { key: "company.general.family_price_distribution", label: "Family Price Distribution Method", type: "select", options: [
        { value: "MATCH_PRICE_POINTS", label: "Match Price Points" },
        { value: "PROPORTIONAL", label: "Proportional" },
      ]},
      { key: "company.general.price_rounding_mode", label: "Price Rounding Mode", type: "select", options: [
        { value: "REDISTRIBUTE", label: "Redistribute" },
        { value: "TRUNCATE", label: "Truncate" },
        { value: "ROUND", label: "Round" },
      ]},
      { key: "company.general.cost_calculation_method", label: "Cost Calculation Method", type: "select", options: [
        { value: "LAST_COST", label: "Last Cost" },
        { value: "AVERAGE_COST", label: "Average Cost" },
        { value: "MIXED_MODE", label: "Mixed Mode" },
      ]},
      { key: "company.general.profitability_display", label: "Profitability Display", type: "select", options: [
        { value: "GROSS_PROFIT_MARGIN", label: "Gross Profit Margin" },
        { value: "GROSS_PROFIT", label: "Gross Profit" },
        { value: "MARKUP", label: "Markup" },
      ]},
      { key: "company.general.use_components_packages", label: "Use Components and Packages", type: "boolean" },
      { key: "company.general.products_can_have_weight", label: "Products Can Have Weight", type: "boolean" },
      { key: "company.general.use_barcode_templates", label: "Use Barcode Templates", type: "boolean" },
      { key: "company.general.sell_cases", label: "Sell Cases", type: "boolean" },
      { key: "company.general.cross_promotion_count", label: "Cross promotion count", type: "boolean" },
      { key: "company.general.team_message", label: "Team Message", type: "text" },
      { key: "company.general.price_activation_time", label: "Price Activation Time", type: "number" },
      { key: "company.name", label: "Legal company name", type: "text" },
      { key: "company.abn", label: "ABN", type: "text" },
      { key: "company.street", label: "Street address", type: "text" },
      { key: "company.city", label: "City", type: "text" },
      { key: "company.zip", label: "Postcode", type: "text" },
      { key: "company.phone", label: "Phone", type: "text" },
      { key: "company.email", label: "Email", type: "text" },
    ],
  },
  {
    id: "general-display",
    title: "General Display",
    href: "/settings/company/general-display",
    fields: [
      { key: "company.display.single_text", label: '"Single" Text', type: "text" },
      { key: "company.display.case_text", label: '"Case" Text', type: "text" },
    ],
  },
  {
    id: "login",
    title: "Login",
    href: "/settings/company/login-after-sale",
    fields: [
      { key: "company.login.login_type", label: "Login Type", description: "Orithos currently supports username and password sign-in only.", type: "select", options: [
        { value: "USERNAME_PASSWORD", label: "Username & password" },
      ]},
      { key: "company.login.mask_username", label: "Mask Username", type: "boolean" },
      { key: "company.login.require_password", label: "Require Password", type: "boolean" },
      { key: "company.login.general_auto_logout_seconds", label: "General Auto Logout Time (seconds)", type: "number" },
      { key: "company.login.sell_auto_logout_seconds", label: "Sell Screen Auto Logout Time (seconds)", type: "number" },
      { key: "company.login.auto_logout_during_sale", label: "Auto Logout During Sale", type: "boolean" },
    ],
  },
  {
    id: "sell-screen",
    title: "Sell Screen / Register",
    href: "/settings/company/sell-screen",
    fields: [
      { key: "company.sell.show_product_details_on_add", label: "Show Product Details When a Product is Added", type: "boolean" },
      { key: "company.sell.display_customer_details_on_add", label: "Display Customer Details When a Customer is Added", type: "boolean" },
      { key: "company.sell.prevent_blur_on_focus_loss", label: "Prevent Blur on Focus Loss on Sell Screen", type: "boolean" },
      { key: "company.sell.keep_select_product_open", label: "Keep Select Product Popup Open", type: "boolean" },
      { key: "company.sell.select_product_paginated", label: "Make Select Product Popup Paginated by Default", type: "boolean" },
      { key: "company.sell.discounts_require_reason", label: "Discounts Require Reason", type: "boolean" },
      { key: "company.sell.refunds_require_reason", label: "Refunds Require Reason", type: "boolean" },
      { key: "company.sell.cash_drawer_require_reason", label: "Require reason when opening the cash drawer", type: "boolean" },
      { key: "company.sell.allow_cash_out_without_sale", label: "Allow cash out without sale", type: "boolean" },
      { key: "company.sell.require_note_on_parked_sale", label: "Require Note on Parked Sale", type: "boolean" },
      { key: "company.sell.invoice_number_length", label: "Invoice number length", type: "number" },
      { key: "company.sell.cash_in_reasons", label: "Cash In Reasons", description: "One reason per line when editing; stored as JSON.", type: "string-list" },
      { key: "company.sell.cash_out_reasons", label: "Cash Out Reasons", description: "One reason per line when editing; stored as JSON.", type: "string-list" },
    ],
  },
  {
    id: "outlets",
    title: "Outlets",
    href: "/settings/company/outlets",
    fields: [
      { key: "company.outlets.share_parked_sales", label: "Share Parked Sales Between Outlets", type: "boolean" },
      { key: "company.outlets.share_gift_cards", label: "Share Gift Cards Between Outlets", type: "boolean" },
    ],
  },
  {
    id: "date-time",
    title: "Date & Time",
    href: "/settings/company/date-time",
    fields: [
      { key: "company.timezone", label: "Timezone", type: "text" },
      { key: "company.date_format", label: "Date Format", type: "select", options: [
        { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
        { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
        { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
      ]},
      { key: "company.time_format", label: "Time Format", type: "select", options: [
        { value: "HH:mm", label: "HH:mm" },
        { value: "HH:mm:ss", label: "HH:mm:ss" },
        { value: "hh:mm a", label: "hh:mm a" },
        { value: "hh:mm:ss a", label: "hh:mm:ss a" },
      ]},
      { key: "company.start_of_week", label: "Start of the Week", type: "select", options: [
        { value: "MONDAY", label: "Monday" },
        { value: "SUNDAY", label: "Sunday" },
      ]},
    ],
  },
  {
    id: "currency",
    title: "Currency",
    href: "/settings/company/currency",
    fields: [
      { key: "company.currency.round_to", label: "Round To", description: "Cash tender rounding increment (AU default 0.05).", type: "number" },
      { key: "company.currency.code", label: "Currency Code", type: "text" },
      { key: "company.currency.number_locale", label: "Number Locale", type: "text" },
    ],
  },
  {
    id: "search",
    title: "Search",
    href: "/settings/company/search",
    fields: [
      { key: "company.search.customer_level", label: "Customer Search Level", type: "select", options: [
        { value: "STANDARD", label: "Standard" },
        { value: "EXTENDED", label: "Extended" },
      ]},
      { key: "company.search.product_level", label: "Product Search Level", type: "select", options: [
        { value: "STANDARD", label: "Standard" },
        { value: "EXTENDED", label: "Extended" },
      ]},
      { key: "company.search.cache_location", label: "Search Cache Save Location", type: "select", options: [
        { value: "BROWSER", label: "Browser" },
        { value: "SERVER", label: "Server" },
      ]},
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    href: "/settings/company/integrations",
    fields: [
      { key: "company.integrations.metcash_host_file", label: "Metcash Host File Integration", type: "boolean" },
    ],
  },
  {
    id: "miscellaneous",
    title: "Miscellaneous",
    href: "/settings/company/miscellaneous",
    fields: [
      { key: "company.misc.default_sale_keys", label: "Default Sale Keys", type: "text" },
      { key: "company.misc.sale_keys_position", label: "Sale Keys Position", type: "select", options: [
        { value: "RIGHT", label: "Right" },
        { value: "LEFT", label: "Left" },
        { value: "BOTTOM", label: "Bottom" },
      ]},
      { key: "company.misc.price_change_notifications", label: "Price Change Notifications", type: "boolean" },
      { key: "company.misc.statement_reply_to", label: 'Global Statement "Reply To" Email', type: "text" },
      { key: "company.misc.avg_cost_on_price_editor", label: "Show Average Cost on Price Editor When Editing Orders", type: "boolean" },
      { key: "company.misc.default_new_users_all_outlet_reporting", label: "Default New Users to Reporting Access for All Outlets", type: "boolean" },
      { key: "company.misc.debug_logging_level", label: "Debug Logging Level", type: "select", options: [
        { value: "INFO", label: "Info" },
        { value: "DEBUG", label: "Debug" },
        { value: "WARN", label: "Warn" },
      ]},
    ],
  },
];

export function sectionByHref(href: string): CompanySection | undefined {
  return COMPANY_SECTIONS.find((section) => section.href === href);
}
