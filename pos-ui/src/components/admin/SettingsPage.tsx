import type { ReactNode } from "react";
import Link from "next/link";
import { SettingsTopTabs } from "./SettingsTopTabs";

export function SettingsSubTabs({ tabs, label = "Settings subsections" }: { tabs: { label: string; href: string; active?: boolean }[]; label?: string }) {
  return <nav aria-label={label} className="flex flex-wrap gap-1 border-t border-[var(--oh-border)] p-2">{tabs.map(tab => <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)] ${tab.active ? "bg-[var(--oh-surface)] text-[var(--oh-primary)]" : "text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"}`}>{tab.label}</Link>)}</nav>;
}

export function SettingsPage({ title, subtitle, activeHref, subTabs, actions, children }: { title: string; subtitle?: string; activeHref: string; subTabs?: ReactNode; actions?: ReactNode; children: ReactNode }) {
 return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-4 pb-24 md:p-6"><div className="mx-auto w-full max-w-6xl"><h1 className="mb-5 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Settings</h1><div className="mb-6 overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]"><SettingsTopTabs activeHref={activeHref} />{subTabs}</div><header className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-[var(--oh-text)]">{title}</h2>{subtitle && <p className="mt-1 text-sm leading-6 text-[var(--oh-muted)]">{subtitle}</p>}</div>{actions}</header><div className="min-w-0 space-y-5">{children}</div></div></main>;
}
