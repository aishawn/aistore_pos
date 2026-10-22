import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DEVICES_SETTINGS_TABS,
  STORE_SETTINGS_TABS,
  type SetupHubTab,
} from "@/lib/setup-hub-nav";

function HubTabs({
  tabs,
  activeHref,
  label,
}: {
  tabs: SetupHubTab[];
  activeHref: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex max-w-full overflow-x-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]"
    >
      {tabs.map((tab) => {
        const active = activeHref === tab.href || activeHref.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
    </nav>
  );
}

export function StoreSettingsTabs({ activeHref }: { activeHref: string }) {
  return <HubTabs tabs={STORE_SETTINGS_TABS} activeHref={activeHref} label="Store settings" />;
}

export function DevicesSettingsTabs({ activeHref }: { activeHref: string }) {
  return <HubTabs tabs={DEVICES_SETTINGS_TABS} activeHref={activeHref} label="Device settings" />;
}
