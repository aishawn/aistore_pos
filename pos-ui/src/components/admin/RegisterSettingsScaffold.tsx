import {
  NumberRow,
  SelectRow,
  SettingsScaffold,
  TextRow,
  ToggleRow,
} from "@/components/admin/SettingsScaffold";
import {
  COMPANY_SETTINGS_TABS,
  REGISTER_SETTINGS_NAV,
  settingsTabActive,
} from "@/lib/company-settings-nav";

/** Register-scoped settings page shell — Registers tab in General Settings. */
export function RegisterSettingsScaffold({
  subSectionTitle,
  activeHref,
  children,
}: {
  subSectionTitle: string;
  activeHref: string;
  children: React.ReactNode;
}) {
  const tabs = COMPANY_SETTINGS_TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: settingsTabActive(tab.label, tab.href, activeHref),
  }));

  const subTabs = REGISTER_SETTINGS_NAV.map((item) => ({
    label: item.label,
    href: item.href,
    active: activeHref === item.href,
  }));

  return (
    <SettingsScaffold
      title="General Settings"
      sectionTitle="Registers"
      subSectionTitle={subSectionTitle}
      tabs={tabs}
      subTabs={subTabs}
    >
      <SelectRow
        label="Register"
        value="Register"
        description="Select the register to configure. Settings apply to the selected register only."
      />
      {children}
    </SettingsScaffold>
  );
}

export { ToggleRow, SelectRow, TextRow, NumberRow };
