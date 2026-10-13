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
  ArrowRightLeft,
  Keyboard,
  Mail,
  CreditCard,
  Percent,
  Monitor,
  Printer,
  Barcode,
  SlidersHorizontal,
  MapPin,
  Building2,
  Wine,
  ScanLine,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { OrithosLogo } from "@/components/OrithosLogo";
import {
  getSidebarNavigation,
  type SidebarGroup,
  type SidebarIcon,
  type SidebarItem,
} from "@/lib/sidebar-navigation";
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

/** Per-item icons for the Settings sub-menu (matches Shopfront Setup drawer). */
const SETTINGS_SUB_ICONS: Record<string, LucideIcon> = {
  "/settings": Settings,
  "/settings/company/general": Settings,
  "/settings/account": ArrowRightLeft,
  "/settings/keys": Keyboard,
  "/settings/statements": Mail,
  "/settings/payment": CreditCard,
  "/settings/tax": Percent,
  "/settings/customerdisplay": Monitor,
  "/settings/surcharging": CreditCard,
  "/settings/hardware": Printer,
  "/settings/barcodes": Barcode,
  "/settings/pricesets": SlidersHorizontal,
  "/settings/registers-outlets": MapPin,
  "/enterprise": Building2,
};

function isGroup(entry: SidebarItem | SidebarGroup): entry is SidebarGroup {
  return "items" in entry;
}

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function subItemActive(href: string, pathname: string, siblings: { href: string }[]) {
  const matches = pathname === href || pathname.startsWith(`${href}/`);
  if (!matches) return false;
  const bestMatch = siblings
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return bestMatch?.href === href;
}

function groupActive(group: SidebarGroup, pathname: string) {
  return group.items.some((item) => subItemActive(item.href, pathname, group.items));
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

export function Sidebar({ open = true }: { open?: boolean }) {
  const pathname = usePathname();
  const guardNav = useGuardedNav();
  const checkoutKeyboard = pathname === "/" || pathname === "/finalise";

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden bg-[var(--oh-sidebar-bg)] font-sans transition-[width] duration-200 ease-in-out print:hidden",
        open ? "w-[var(--oh-sidebar-width)]" : "w-0",
      )}
      aria-label="Main navigation"
      aria-hidden={!open}
    >
      <div className="flex min-w-[var(--oh-sidebar-width)] flex-1 flex-col">
      <div className="flex h-[var(--oh-header-height)] items-center border-b border-[var(--oh-sidebar-border)] px-4">
        <OrithosLogo />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {getSidebarNavigation().map((entry) =>
            isGroup(entry) ? (
              <SidebarNavGroup key={entry.label} group={entry} pathname={pathname} guardNav={guardNav} tabIndex={checkoutKeyboard ? -1 : undefined} />
            ) : (
              <SidebarNavLink key={entry.href} item={entry} pathname={pathname} guardNav={guardNav} tabIndex={checkoutKeyboard ? -1 : undefined} />
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
  tabIndex,
}: {
  item: SidebarItem;
  pathname: string;
  guardNav: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  tabIndex?: number;
}) {
  const Icon = ICONS[item.icon];
  const active = isActive(item.href, pathname);

  return (
    <li>
      <Link
        href={item.href}
        tabIndex={tabIndex}
        onClick={(event) => guardNav(event, item.href)}
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
  tabIndex,
}: {
  group: SidebarGroup;
  pathname: string;
  guardNav: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  tabIndex?: number;
}) {
  const [expanded, setExpanded] = useState(groupActive(group, pathname));
  const Icon = ICONS[group.icon];
  const active = groupActive(group, pathname);

  return (
    <li>
      <button
        type="button"
        tabIndex={tabIndex}
        onClick={() => setExpanded((v) => !v)}
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
        {expanded ? <ChevronDown size={16} className="opacity-50" /> : <ChevronRight size={16} className="opacity-50" />}
      </button>
      {expanded && (
        <ul className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--oh-sidebar-border)] pl-3">
          {group.items.map((item) => {
            const active = subItemActive(item.href, pathname, group.items);
            const SubIcon = SETTINGS_SUB_ICONS[item.href];
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  tabIndex={tabIndex}
                  onClick={(event) => guardNav(event, item.href)}
                  className={cn(
                    "oh-type-label relative flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 font-medium transition-colors",
                    active
                      ? "bg-[var(--oh-sidebar-active-pill)] text-[var(--oh-sidebar-active)]"
                      : "text-[var(--oh-sidebar-text)] hover:text-[var(--oh-sidebar-text-hover)]",
                  )}
                >
                  {active && (
                    <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r-full bg-[var(--oh-sidebar-active)]" />
                  )}
                  {item.more ? (
                    <Plus
                      size={14}
                      strokeWidth={2.5}
                      className={cn(
                        "shrink-0",
                        active ? "text-[var(--oh-sidebar-active)]" : "text-[var(--oh-primary)]",
                      )}
                    />
                  ) : SubIcon ? (
                    <SubIcon
                      size={14}
                      strokeWidth={1.75}
                      className={cn(
                        "shrink-0",
                        active ? "text-[var(--oh-sidebar-active)]" : "text-[var(--oh-primary)]",
                      )}
                    />
                  ) : null}
                  {item.more ? "More" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
