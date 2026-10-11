import {
  NumberRow,
  RegisterSettingsScaffold,
  SelectRow,
} from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/general";

export default function RegisterGeneralSettingsPage() {
  return (
    <RegisterSettingsScaffold subSectionTitle="General" activeHref={HREF}>
      <NumberRow
        label="Safe Drop Alert Amount"
        value={0}
        description="The amount of cash in the drawer required to trigger a Safe drop which allows you to move money from the register to your safe. If set to zero no alert will ever be triggered"
      />
      <SelectRow
        label="Default Payment Method"
        value="Cash"
        description="The default payment method to use for paying on the sell screen. This is typically used when pressing enter on the keyboard in the finalise sale screen"
      />
      <SelectRow
        label="Default Receipt Template"
        value="Receipt"
        description="The default sale receipt template to display once a sale has finished. The receipt template for each sale can be changed before printing"
      />
      <SelectRow
        label="Dark Mode"
        value="Force Light Mode"
        description="The colour scheme to use throughout Orithopos, by default Orithopos forces light mode, but can be configured to force dark mode or to automatically detect which colour scheme it should use based on the device's settings"
      />
    </RegisterSettingsScaffold>
  );
}
