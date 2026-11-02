import { SettingsPage } from "./SettingsPage";
export function UserSettingsScaffold({ children }: { children: React.ReactNode }) {
 return <SettingsPage title="Staff & access" activeHref="/settings/staff">{children}</SettingsPage>;
}
