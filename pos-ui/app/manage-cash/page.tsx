import {
  AdminPageLayout,
  AdminPillButton,
  AdminEmptyHero,
} from "@/components/admin/AdminPageLayout";
import { WalletIcon } from "@/components/icons";

const ACTIONS = ["Open Cash Drawer", "Put Cash In", "Take Cash Out", "Safe Drop", "Swap Cash"];

export default function ManageCashPage() {
  return (
    <AdminPageLayout
      title="Manage Cash"
      subtitle="Adjust cash in the register drawer"
      toolbar={
        <>
          {ACTIONS.map((a) => (
            <AdminPillButton key={a}>{a}</AdminPillButton>
          ))}
        </>
      }
    >
      <div className="mb-8 flex gap-12">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Open Time</div>
          <div className="mt-1 text-[15px] text-[var(--oh-text)]">27/06/2026 12:47:21</div>
        </div>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Received Cash In Drawer</div>
          <div className="mt-1 text-[15px] font-semibold text-[var(--oh-text)]">$0.00</div>
        </div>
      </div>

      <AdminEmptyHero
        icon={<WalletIcon size={80} strokeWidth={1.5} />}
        title="No Cash Movements"
        description="You can adjust the cash in the drawer by using the buttons above."
      />
    </AdminPageLayout>
  );
}
