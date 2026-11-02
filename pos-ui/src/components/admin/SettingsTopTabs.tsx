import Link from "next/link";
import { COMPANY_SETTINGS_TABS, settingsTabActive } from "@/lib/company-settings-nav";

export function SettingsTopTabs({ activeHref }: { activeHref: string }) {
  return (
    <nav aria-label="Settings sections" className="flex max-w-full overflow-x-auto border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
      {COMPANY_SETTINGS_TABS.map((tab) => {
        const active = settingsTabActive(tab.label, tab.href, activeHref);
        return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-max flex-1 items-center justify-center whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:text-base ${active ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"}`}>{tab.label}</Link>;
      })}
    </nav>
  );
}
