import type { ReactNode } from "react";
import { ReportsNavigation } from "@/components/admin/ReportsNavigation";

export default function HistoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <ReportsNavigation />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
