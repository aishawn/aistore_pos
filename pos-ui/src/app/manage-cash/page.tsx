import {
  AdminPageLayout,
  AdminEmptyHero,
} from "@/components/admin/AdminPageLayout";
import { WalletIcon } from "@/components/icons";

/** Stub kept for deep links; cash in/out is not wired to Odoo yet. */
export default function ManageCashPage() {
  return (
    <AdminPageLayout
      title="Manage Cash"
      subtitle="Cash drawer adjustments are not available in this pilot build"
    >
      <AdminEmptyHero
        icon={<WalletIcon size={80} strokeWidth={1.5} />}
        title="Coming soon"
        description="Use Odoo POS for cash in, cash out and drawer reconciliation until Orithos Manage Cash is connected to Odoo. This page does not change cash or create Odoo entries."
      />
    </AdminPageLayout>
  );
}
