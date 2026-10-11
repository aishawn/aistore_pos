import { RegisterSettingsScaffold, SelectRow, TextRow } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/invoices";

export default function RegisterInvoicesSettingsPage() {
  return (
    <RegisterSettingsScaffold subSectionTitle="Invoices" activeHref={HREF}>
      <TextRow
        label="Offline Invoice Suffix"
        value="A"
        description="The Offline invoice suffix gets appended to the end of the Current invoice number when a sale is completed and the computer is offline. We would suggest making this value different for each register"
      />
      <SelectRow
        label="Invoice Number Mode"
        value="Incremental"
        description="The method Orithopos will use to generate sale invoice numbers"
      />
    </RegisterSettingsScaffold>
  );
}
