import {
  NumberRow,
  SelectRow,
  SettingsScaffold,
  TextRow,
  ToggleRow,
} from "@/components/admin/SettingsScaffold";
import {
  COMPANY_SETTINGS_TABS,
  OUTLET_SETTINGS_NAV,
  settingsTabActive,
} from "@/lib/company-settings-nav";

/** Outlet-scoped settings page shell — Outlets tab in General Settings. */
export function OutletSettingsScaffold({
  subSectionTitle,
  activeHref,
  children,
  showOutletSelector = true,
  showSearch = true,
  showSave = true,
}: {
  subSectionTitle: string;
  activeHref: string;
  children: React.ReactNode;
  showOutletSelector?: boolean;
  showSearch?: boolean;
  showSave?: boolean;
}) {
  const tabs = COMPANY_SETTINGS_TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: settingsTabActive(tab.label, tab.href, activeHref),
  }));

  const subTabs = OUTLET_SETTINGS_NAV.map((item) => ({
    label: item.label,
    href: item.href,
    active: activeHref === item.href,
  }));

  return (
    <SettingsScaffold
      title="General Settings"
      sectionTitle="Outlets"
      subSectionTitle={subSectionTitle}
      showSearch={showSearch}
      showSave={showSave}
      tabs={tabs}
      subTabs={subTabs}
    >
      {showOutletSelector && <SelectRow label="Outlet" value="Main Outlet" />}
      {children}
    </SettingsScaffold>
  );
}

export { ToggleRow, SelectRow, TextRow, NumberRow };
