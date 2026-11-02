import { SettingsPage, SettingsSubTabs } from "./SettingsPage";
import {
  EditReasonsRow,
  NumberRow,
  SelectRow,
  TextRow,
  ToggleRow,
} from "@/components/admin/SettingsScaffold";
import {
  COMPANY_SETTINGS_NAV,
} from "@/lib/company-settings-nav";

/** Company-scoped settings page shell — matches project SettingsScaffold style. */
export function CompanySettingsScaffold({
  activeHref,
  children,
}: {
  subSectionTitle: string;
  activeHref: string;
  children: React.ReactNode;
  showSearch?: boolean;
  showSave?: boolean;
}) {
  return <SettingsPage title="Company" activeHref={activeHref} subTabs={<SettingsSubTabs tabs={COMPANY_SETTINGS_NAV.map(item => ({ ...item, active: item.href === activeHref }))} />}>{children}</SettingsPage>;
}

export { ToggleRow, SelectRow, TextRow, NumberRow, EditReasonsRow };
