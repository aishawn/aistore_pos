"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  DEVICES_SETTINGS_TABS,
  STORE_SETTINGS_TABS,
  type SetupHubTab,
} from "@/lib/setup-hub-nav";
import { SettingsTopTabs } from "@/components/admin/SettingsTopTabs";

function HubTabs({
  tabs,
  activeHref,
  label,
}: {
  tabs: SetupHubTab[];
  activeHref: string;
  label: string;
}) {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, activeHref]);

  return (
    <nav
      aria-label={label}
      className="max-w-full overflow-x-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] [scrollbar-width:thin]"
    >
      <div className="flex min-w-max items-stretch">
        {tabs.map((tab) => {
          const active = activeHref === tab.href || activeHref.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={active ? activeTabRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-max flex-1 items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors sm:text-[15px]",
                active
                  ? "border-b-2 border-[var(--oh-primary)] text-[var(--oh-primary)]"
                  : "border-b-2 border-transparent text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function StoreSettingsTabs({ activeHref }: { activeHref: string }) {
  return <div className="grid gap-3"><SettingsTopTabs activeHref={activeHref} /><HubTabs tabs={STORE_SETTINGS_TABS} activeHref={activeHref} label="Store settings" /></div>;
}

export function DevicesSettingsTabs({ activeHref }: { activeHref: string }) {
  return <HubTabs tabs={DEVICES_SETTINGS_TABS} activeHref={activeHref} label="Device settings" />;
}
