import {
  CompanySettingsScaffold,
  EditReasonsRow,
  NumberRow,
  SelectRow,
  TextRow,
  ToggleRow,
} from "@/components/admin/CompanySettingsScaffold";

const HREF = "/settings/company/general";

export default function GeneralCompanySettingsPage() {
  return (
    <CompanySettingsScaffold subSectionTitle="General" activeHref={HREF}>
      <SelectRow label="Use quantity rate" value="High Mix Price" />
      <SelectRow label="Family price distribution method" value="Match Price Points" />
      <SelectRow label="Price rounding mode" value="Round" />
      <SelectRow label="Cost calculation method" value="Last Cost" />
      <SelectRow label="Profitability display" value="Gross Profit Margin" />
      <ToggleRow label="Use Components and Packages" />
      <ToggleRow label="Products can have weight" />
      <ToggleRow label="Use barcode templates" />
      <ToggleRow label="Sell cases" on />
      <ToggleRow label="Cross promotion count" on />
      <TextRow
        label="Team message"
        value="Need assistance? Contact your Orithos administrator."
      />
      <NumberRow label="Price activation time" value={0} />
      <ToggleRow label="Refunds require reason" />
      <ToggleRow label="Require reason when opening the cash drawer" />
      <EditReasonsRow label="Predefined cash out reasons" />
      <EditReasonsRow label="Predefined cash in reasons" />
      <ToggleRow label="Allow cash out without sale" on />
      <ToggleRow label="Require note on parked sale" />
      <NumberRow label="Invoice number length" value={8} />
    </CompanySettingsScaffold>
  );
}
