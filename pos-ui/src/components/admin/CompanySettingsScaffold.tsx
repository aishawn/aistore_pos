import {
  EditReasonsRow,
  NumberRow,
  SelectRow,
  SettingsScaffold,
  TextRow,
  ToggleRow,
} from "@/components/admin/SettingsScaffold";
import {
  COMPANY_SETTINGS_NAV,
  COMPANY_SETTINGS_TABS,
  settingsTabActive,
} from "@/lib/company-settings-nav";

/** Company-scoped settings page shell — matches project SettingsScaffold style. */
export function CompanySettingsScaffold({
  subSectionTitle,
  activeHref,
  children,
  showSearch = true,
  showSave = true,
}: {
  subSectionTitle: string;
  activeHref: string;
  children: React.ReactNode;
  showSearch?: boolean;
  showSave?: boolean;
}) {
  const tabs = COMPANY_SETTINGS_TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: settingsTabActive(tab.label, tab.href, activeHref),
  }));

  const subTabs = COMPANY_SETTINGS_NAV.map((item) => ({
    label: item.label,
    href: item.href,
    active: activeHref === item.href,
  }));

  return (
    <SettingsScaffold
      title="General Settings"
      sectionTitle="Company Settings"
      subSectionTitle={subSectionTitle}
      showSearch={showSearch}
      showSave={showSave}
      tabs={tabs}
      subTabs={subTabs}
    >
      {children}
    </SettingsScaffold>
  );
}

export { ToggleRow, SelectRow, TextRow, NumberRow, EditReasonsRow };
