import { SettingsScaffold, ToggleRow, SelectRow } from "@/components/admin/SettingsScaffold";

export default function AccountBillingPage() {
  return (
    <SettingsScaffold title="Account & Billing" sectionTitle="Account & Billing">
      <SelectRow label="Subscription Plan" value="Orithos Pro" />
      <SelectRow label="Billing Cycle" value="Monthly" />
      <SelectRow label="Payment Method" value="Visa ending 4242" />
      <ToggleRow label="Auto-renew subscription" on />
      <ToggleRow label="Email billing receipts" on />
    </SettingsScaffold>
  );
}
