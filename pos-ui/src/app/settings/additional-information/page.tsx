import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function AdditionalInformationPage() {
  return (
    <SettingsScaffold title="Additional Information" sectionTitle="Additional Information">
      <ToggleRow label="Capture additional sale information" />
      <SelectRow label="Required at" value="Finalise" />
      <ToggleRow label="Make field mandatory" />
      <ToggleRow label="Show on receipt" on />
    </SettingsScaffold>
  );
}
