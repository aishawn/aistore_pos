"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
  ChevronRight,
  Plus,
  Percent,
  Wine,
  ScanLine,
  LayoutDashboard,
} from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import {
  getSidebarNavigation,
  type SidebarGroup,
  type SidebarIcon,
  type SidebarItem,
  type SidebarGroupItem,
  type SidebarSubGroup,
} from "@/lib/sidebar-navigation";
import { useGiftCardCapability } from "@/hooks/useGiftCardCapability";
import { useAuth } from "@/lib/auth";
import { useUnsavedChangesOptional } from "@/lib/unsaved-changes";
import { cn } from "@/lib/utils";

const ICONS: Record<SidebarIcon, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  sales: ShoppingCart,
  sommelier: Wine,
  invoice: ScanLine,
  inventory: Package,
  customers: Users,
  reporting: BarChart3,
  settings: Settings,
  marketing: Percent,
};

function isGroup(entry: SidebarItem | SidebarGroup): entry is SidebarGroup {
  return "items" in entry;
}

function isSubGroup(entry: SidebarGroupItem | SidebarSubGroup): entry is SidebarSubGroup {
  return "items" in entry;
}

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/overview" || pathname.startsWith("/overview/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pathMatches(href: string, pathname: string, matchHrefs?: string[]) {
  const candidates = [href, ...(matchHrefs ?? [])];
  return candidates.some((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
}

function subItemActive(
  item: { href: string; matchHrefs?: string[] },
  pathname: string,
  siblings: { href: string; matchHrefs?: string[] }[],
) {
  if (!pathMatches(item.href, pathname, item.matchHrefs)) return false;
  const bestMatch = siblings
    .filter((s) => pathMatches(s.href, pathname, s.matchHrefs))
    .sort((a, b) => {
      const aLen = Math.max(a.href.length, ...(a.matchHrefs ?? []).map((h) => h.length));
      const bLen = Math.max(b.href.length, ...(b.matchHrefs ?? []).map((h) => h.length));
      return bLen - aLen;
    })[0];
  return bestMatch?.href === item.href;
}

function groupActive(group: SidebarGroup, pathname: string) {
  const items = group.items.flatMap((item) => isSubGroup(item) ? item.items : [item]);
  return items.some((item) => subItemActive(item, pathname, items));
}

function useGuardedNav() {
  const router = useRouter();
  const unsaved = useUnsavedChangesOptional();

  return (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!unsaved?.isDirtyNow()) return;
    event.preventDefault();
    unsaved.confirmNavigation(() => router.push(href));
  };
}

export function Sidebar({
  open = true,
  mobileOpen = false,
  onNavigate,
}: {
  open?: boolean;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const guardNav = useGuardedNav();
  const { user, hasPermission } = useAuth();
  const giftCapability = useGiftCardCapability();
  const checkoutKeyboard = pathname === "/" || pathname === "/finalise";
  const navigation = getSidebarNavigation({
    isAdmin: Boolean(user?.isAdmin),
    hasPermission,
    giftCardsAvailable: giftCapability.available === true,
  });

  return (
    <aside
      id="main-navigation"
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-full w-[var(--oh-sidebar-width)] shrink-0 flex-col overflow-hidden bg-[var(--oh-sidebar-bg)] font-sans shadow-xl transition-transform duration-200 ease-in-out print:hidden md:static md:z-auto md:shadow-none md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none md:pointer-events-auto md:translate-x-0",
        open ? "md:w-[var(--oh-sidebar-width)]" : "md:w-0",
      )}
      aria-label="Main navigation"
      aria-hidden={!open && !mobileOpen}
      inert={!open && !mobileOpen}
    >
      <div className="flex min-w-[var(--oh-sidebar-width)] flex-1 flex-col">
      <div className="flex h-[var(--oh-header-height)] items-center border-b border-[var(--oh-sidebar-border)] px-4">
        <Link
          href="/dashboard"
          aria-label="Open Dashboard"
          title="Dashboard"
          onClick={(event) => {
            guardNav(event, "/dashboard");
            if (!event.defaultPrevented) onNavigate?.();
          }}
          className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-1 transition-colors hover:bg-[var(--oh-sidebar-active-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <OrithosLogo />
        </Link>
      </div>

      {giftCapability.error && <button type="button" disabled={giftCapability.loading} onClick={giftCapability.refresh} className="mx-3 min-h-11 rounded border border-white/20 px-2 text-xs text-white">Gift cards: retry availability</button>}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {navigation.map((entry) =>
            isGroup(entry) ? (
              <SidebarNavGroup key={entry.label} group={entry} pathname={pathname} guardNav={guardNav} onNavigate={onNavigate} tabIndex={checkoutKeyboard ? -1 : undefined} />
            ) : (
              <SidebarNavLink key={entry.href} item={entry} pathname={pathname} guardNav={guardNav} onNavigate={onNavigate} tabIndex={checkoutKeyboard ? -1 : undefined} />
            ),
          )}
        </ul>
      </nav>
      </div>
    </aside>
  );
}

function SidebarNavLink({
  item,
  pathname,
  guardNav,
  onNavigate,
  tabIndex,
}: {
  item: SidebarItem;
  pathname: string;
  guardNav: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavigate?: () => void;
  tabIndex?: number;
}) {
  const Icon = ICONS[item.icon];
  const active = isActive(item.href, pathname);

  return (
    <li>
      <Link
        href={item.href}
        tabIndex={tabIndex}
        onClick={(event) => {
          guardNav(event, item.href);
          if (!event.defaultPrevented) onNavigate?.();
        }}
        className={cn(
          "oh-type-label relative flex items-center gap-3 whitespace-nowrap rounded-[var(--oh-radius)] py-2.5 pl-3 pr-3 font-medium transition-colors",
          active
            ? "bg-[var(--oh-sidebar-active-pill)] text-[var(--oh-sidebar-active)]"
            : "text-[var(--oh-sidebar-text)] hover:bg-[var(--oh-sidebar-active-bg)] hover:text-[var(--oh-sidebar-text-hover)]",
        )}
      >
        {active && (
          <span className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-full bg-[var(--oh-sidebar-active)]" />
        )}
        <Icon size={18} strokeWidth={1.75} className={active ? "text-[var(--oh-sidebar-active)]" : ""} />
        {item.label}
      </Link>
    </li>
  );
}

function SidebarNavGroup({
  group,
  pathname,
  guardNav,
  onNavigate,
  tabIndex,
}: {
  group: SidebarGroup;
  pathname: string;
  guardNav: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavigate?: () => void;
  tabIndex?: number;
}) {
  const [expanded, setExpanded] = useState(groupActive(group, pathname));
  const Icon = ICONS[group.icon];
  const active = groupActive(group, pathname);
  // Keep the active destination reachable after route changes. Inactive groups
  // remain manually collapsible to keep the navigation compact.
  const visiblyExpanded = expanded || active;
  const submenuId = `sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <li>
      <button
        type="button"
        tabIndex={tabIndex}
        aria-expanded={visiblyExpanded}
        aria-controls={submenuId}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "oh-type-label flex w-full cursor-pointer items-center justify-between whitespace-nowrap rounded-[var(--oh-radius)] px-3 py-2.5 font-medium transition-colors",
          active
            ? "bg-[var(--oh-sidebar-active-pill)] text-[var(--oh-sidebar-active)]"
            : "text-[var(--oh-sidebar-text)] hover:bg-[var(--oh-sidebar-active-bg)] hover:text-[var(--oh-sidebar-text-hover)]",
        )}
      >
        <span className="flex items-center gap-3">
          <Icon
            size={18}
            strokeWidth={1.75}
            className={active ? "text-[var(--oh-sidebar-active)]" : ""}
          />
          {group.label}
        </span>
        {visiblyExpanded ? <ChevronDown size={16} className="opacity-50" /> : <ChevronRight size={16} className="opacity-50" />}
      </button>
      {visiblyExpanded && (
        <ul id={submenuId} className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--oh-sidebar-border)] pl-3">
          {group.items.map((item) => {
            if (isSubGroup(item)) {
              return <SidebarNavSubGroup key={item.label} group={item} pathname={pathname} guardNav={guardNav} onNavigate={onNavigate} tabIndex={tabIndex} />;
            }
            const groupItem = item as SidebarGroupItem;
            const siblingItems = group.items.filter((candidate): candidate is SidebarGroupItem => !isSubGroup(candidate));
            const active = subItemActive(groupItem, pathname, siblingItems);
            return (
              <li key={groupItem.href}>
                <Link
                  href={groupItem.href}
                  tabIndex={tabIndex}
                  title={groupItem.hint}
                  onClick={(event) => {
                    guardNav(event, groupItem.href);
                    if (!event.defaultPrevented) onNavigate?.();
                  }}
                  className={cn(
                    "oh-type-label relative flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 font-medium transition-colors",
                    active
                      ? "bg-[var(--oh-sidebar-active-pill)] text-[var(--oh-sidebar-active)]"
                      : "text-[var(--oh-sidebar-text)] hover:bg-[var(--oh-sidebar-active-bg)] hover:text-[var(--oh-sidebar-text-hover)]",
                  )}
                >
                  {active && (
                    <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r-full bg-[var(--oh-sidebar-active)]" />
                  )}
                  {groupItem.more ? (
                    <Plus
                      size={14}
                      strokeWidth={2.5}
                      className={cn(
                        "shrink-0",
                        active ? "text-[var(--oh-sidebar-active)]" : "text-[var(--oh-primary)]",
                      )}
                    />
                  ) : null}
                  {groupItem.more ? "More" : groupItem.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function SidebarNavSubGroup({
  group,
  pathname,
  guardNav,
  onNavigate,
  tabIndex,
}: {
  group: SidebarSubGroup;
  pathname: string;
  guardNav: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavigate?: () => void;
  tabIndex?: number;
}) {
  const subgroupItems = group.items as SidebarGroupItem[];
  const [expanded, setExpanded] = useState(() => subgroupItems.some((item) => pathMatches(item.href, pathname, item.matchHrefs)));
  const active = subgroupItems.some((item) => pathMatches(item.href, pathname, item.matchHrefs));
  const visiblyExpanded = expanded || active;
  const submenuId = `sidebar-subgroup-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <li>
      <button
        type="button"
        tabIndex={tabIndex}
        aria-expanded={visiblyExpanded}
        aria-controls={submenuId}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "oh-type-label flex w-full cursor-pointer items-center justify-between whitespace-nowrap rounded-md px-2.5 py-2 font-medium transition-colors",
          active
            ? "text-[var(--oh-sidebar-active)]"
            : "text-[var(--oh-sidebar-text)] hover:bg-[var(--oh-sidebar-active-bg)] hover:text-[var(--oh-sidebar-text-hover)]",
        )}
      >
        {group.label}
        {visiblyExpanded ? <ChevronDown size={14} className="opacity-50" /> : <ChevronRight size={14} className="opacity-50" />}
      </button>
      {visiblyExpanded && (
        <ul id={submenuId} className="ml-2 flex flex-col gap-0.5 border-l border-[var(--oh-sidebar-border)] pl-2">
          {subgroupItems.map((groupItem) => {
            const itemActive = subItemActive(groupItem, pathname, subgroupItems);
            return (
              <li key={groupItem.href}>
                <Link
                  href={groupItem.href}
                  tabIndex={tabIndex}
                  title={groupItem.hint}
                  onClick={(event) => {
                    guardNav(event, groupItem.href);
                    if (!event.defaultPrevented) onNavigate?.();
                  }}
                  className={cn(
                    "oh-type-label relative flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-2 font-medium transition-colors",
                    itemActive
                      ? "bg-[var(--oh-sidebar-active-pill)] text-[var(--oh-sidebar-active)]"
                      : "text-[var(--oh-sidebar-text)] hover:bg-[var(--oh-sidebar-active-bg)] hover:text-[var(--oh-sidebar-text-hover)]",
                  )}
                >
                  {itemActive && <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r-full bg-[var(--oh-sidebar-active)]" />}
                  {groupItem.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
