import { RegisterSettingsScaffold, SelectRow, ToggleRow } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/customer-display";

export default function RegisterCustomerDisplaySettingsPage() {
  return (
    <RegisterSettingsScaffold subSectionTitle="Customer Display" activeHref={HREF}>
      <SelectRow
        label="Customer Display Template"
        value="Customer Display"
        description="The template to use for the customer facing display"
      />
      <ToggleRow
        label="Open Customer Display when Register Opens"
        description="Whether the customer display should prompt to open when the register is opened (the open register button is pressed)"
        statusLabel="Ignore reminder"
      />
      <SelectRow
        label="Customer Display Open Method"
        value="Presentation"
        description="The method Orithopos will use to open the customer display. 'Presentation' will use Chrome's built-in cast feature, 'Popup' will open the customer display in a popup"
      />
    </RegisterSettingsScaffold>
  );
}
