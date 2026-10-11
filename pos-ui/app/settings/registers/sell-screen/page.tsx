import { RegisterSettingsScaffold, ToggleRow } from "@/components/admin/RegisterSettingsScaffold";

const HREF = "/settings/registers/sell-screen";

export default function RegisterSellScreenSettingsPage() {
  return (
    <RegisterSettingsScaffold subSectionTitle="Sell Screen" activeHref={HREF}>
      <ToggleRow
        label="Login After Sale"
        description="Whether the user should be required to log in after completing a sale (or parking or cancelling a sale)"
        statusLabel="The user won't be prompted to log in after a sale"
      />
      <ToggleRow
        label="Never Open Cash Drawer"
        description="If enabled, the cash drawer will never attempt to be opened, this is useful for using a mobile phone as the register temporarily or for registers without a cash drawer controlled through Orithopos"
        statusLabel="Cash drawer functions normally"
      />
      <ToggleRow
        label="Print Receipt on Refund"
        description="If enabled and a refund is completed, a receipt is automatically printed. When not enabled receipts can still be printed for refunds, but they will have to be manually printed"
        statusLabel="Manually print receipts"
      />
      <ToggleRow
        label="Use Tyro Integrated Receipts"
        on
        description="When using the Tyro EFTPOS payment method this controls if the receipts will print through Orithopos or through the EFTPOS terminal. We would suggest having this setting enabled"
        statusLabel="Use Orithopos's printing"
      />
      <ToggleRow
        label="Consolidate Products"
        on
        description="If enabled, products added to the sell screen will be consolidated when possible (e.g. when scanning the same product multiple times), when disabled, each time the product is added a new line will be created for it"
        statusLabel="Combine products automatically"
      />
      <ToggleRow
        label="Allow Training Mode to be Toggled"
        description="If enabled, it allows users to put the register into training mode where no sales will be processed to allow for the training of new staff members"
        statusLabel="Disable training mode"
      />
      <ToggleRow
        label="Require Note on Register Closure with Discrepancy"
        description="When the expected and received totals on the register closure don't match, force the user to add comments"
        statusLabel="Don't require notes"
      />
      <ToggleRow
        label="Run Promotion Calculation in a Dedicated Thread"
        description="Whether the promotion calculation runs in the background or foreground"
        statusLabel="Use main thread"
      />
    </RegisterSettingsScaffold>
  );
}
