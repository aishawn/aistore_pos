import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { UsersIcon } from "@/components/icons";
import { COMPANY_SETTINGS_TABS, settingsTabActive } from "@/lib/company-settings-nav";

const HREF = "/settings/staff";

/** User-scoped settings page shell — Users tab in General Settings. */
export function UserSettingsScaffold({ children }: { children: React.ReactNode }) {
  const tabs = COMPANY_SETTINGS_TABS.map((tab) => ({
    label: tab.label,
    href: tab.href,
    active: settingsTabActive(tab.label, tab.href, HREF),
  }));

  return (
    <SettingsScaffold
      title="General Settings"
      sectionTitle="Staff & access"
      sectionIcon={<UsersIcon size={24} strokeWidth={1.75} />}
      showSubSectionTitle={false}
      showSearch={false}
      tabs={tabs}
    >
      {children}
    </SettingsScaffold>
  );
}
