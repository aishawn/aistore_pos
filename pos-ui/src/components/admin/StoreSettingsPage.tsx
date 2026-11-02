import type { ReactNode } from "react";
import { SettingsPage } from "./SettingsPage";
export function StoreSettingsPage({ title, subtitle, count, countLabel, actions, toolbar, children }: { title: string; subtitle?: string; count?: number; countLabel?: string; actions?: ReactNode; toolbar?: ReactNode; fullBleed?: boolean; children: ReactNode }) {
 return <SettingsPage title={title} subtitle={subtitle} activeHref="/settings/registers-outlets" subTabs={toolbar} actions={<div className="flex items-center gap-3">{actions}{count !== undefined && <span className="text-sm text-[var(--oh-muted)]">{count} {countLabel}</span>}</div>}>{children}</SettingsPage>;
}
