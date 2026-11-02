"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { COMPANY_SETTINGS_TABS, settingsTabActive } from "@/lib/company-settings-nav";

export function SettingsTopTabs({ activeHref }: { activeHref: string }) {
  const router = useRouter();
  const current = COMPANY_SETTINGS_TABS.find(tab => settingsTabActive(tab.label, tab.href, activeHref));
  return <nav aria-label="Settings sections" className="@container w-full bg-[var(--oh-surface-elevated)]">
    <label className="block p-3 @[560px]:hidden"><span className="sr-only">Settings section</span><select value={current?.href || COMPANY_SETTINGS_TABS[0].href} onChange={event => router.push(event.target.value)} className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base font-medium text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{COMPANY_SETTINGS_TABS.map(tab => <option key={tab.href} value={tab.href}>{tab.label}</option>)}</select></label>
    <div className="hidden w-full @[560px]:flex">{COMPANY_SETTINGS_TABS.map(tab => {
      const active = settingsTabActive(tab.label, tab.href, activeHref);
      return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-4 py-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] ${active ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"}`}>{tab.label}</Link>;
    })}</div>
  </nav>;
}
