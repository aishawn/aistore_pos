"use client";

import { DEVICES_SETTINGS_TABS, STORE_SETTINGS_TABS } from "@/lib/setup-hub-nav";
import { SettingsSubTabs } from "./SettingsPage";

export function StoreSettingsTabs({ activeHref }: { activeHref: string }) {
  return <SettingsSubTabs label="Store settings" tabs={STORE_SETTINGS_TABS.map(tab => ({ ...tab, active: activeHref === tab.href }))} />;
}

export function DevicesSettingsTabs({ activeHref }: { activeHref: string }) {
  return <SettingsSubTabs label="Device settings" tabs={DEVICES_SETTINGS_TABS.map(tab => ({ ...tab, active: activeHref === tab.href }))} />;
}
