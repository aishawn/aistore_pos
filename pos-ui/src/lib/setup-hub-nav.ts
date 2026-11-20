/** In-page tabs for Setup hubs (Store / Devices). Sidebar links to the hub URL. */

export interface SetupHubTab {
  label: string;
  href: string;
  id: string;
}

export const STORE_SETTINGS_TABS: SetupHubTab[] = [
  { id: "registers", label: "Registers & Outlets", href: "/settings/registers-outlets" },
  { id: "payment", label: "Payment Methods", href: "/settings/payment" },
  { id: "tax", label: "Tax Rates", href: "/settings/tax" },
];

export const DEVICES_SETTINGS_TABS: SetupHubTab[] = [
  { id: "receipts", label: "Receipts", href: "/settings/receipts" },
  { id: "hardware", label: "Devices", href: "/settings/hardware" },
];

export const STORE_HUB_DEFAULT = STORE_SETTINGS_TABS[0].href;
export const DEVICES_HUB_DEFAULT = DEVICES_SETTINGS_TABS[0].href;
