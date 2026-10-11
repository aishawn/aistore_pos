import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function HardwarePage() {
  return (
    <SettingsScaffold title="Hardware" sectionTitle="Hardware">
      <SelectRow label="Receipt printer" value="Epson TM-T82" />
      <SelectRow label="Cash drawer" value="Connected via printer" />
      <SelectRow label="Barcode scanner" value="USB (HID)" />
      <SelectRow label="Customer display" value="None" />
      <ToggleRow label="Open drawer on cash sale" on />
    </SettingsScaffold>
  );
}
