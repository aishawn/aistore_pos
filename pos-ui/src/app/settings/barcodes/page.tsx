import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function BarcodeTemplatesPage() {
  return (
    <SettingsScaffold title="Barcode Templates" sectionTitle="Barcode Templates">
      <SelectRow label="Default symbology" value="EAN-13" />
      <SelectRow label="Label size" value="40mm x 28mm" />
      <ToggleRow label="Include price on label" on />
      <ToggleRow label="Include product name" on />
    </SettingsScaffold>
  );
}
