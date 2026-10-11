"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVIGATION } from "@/lib/navigation";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Orithos left slide-out navigation drawer. Mirrors the live hamburger menu:
 * a 500px white panel that slides in from the left (below the 50px header),
 * with standalone links (Sell, Dashboard, Help) and collapsible groups.
 */
export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {/* Click-catcher backdrop (transparent, matches live — no dim) */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-x-0 bottom-0 top-[50px] z-40 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      {/* Panel */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 top-[50px] z-50 flex w-screen max-w-[90%] flex-col overflow-y-auto bg-white shadow-xl transition-transform duration-300 ease-in-out md:w-[500px]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ul className="flex flex-col px-6 py-4">
          {NAVIGATION.map((entry) =>
            entry.kind === "item" ? (
              <NavLink
                key={entry.item.href}
                label={entry.item.label}
                href={entry.item.href}
                external={entry.item.external}
                active={pathname === entry.item.href}
                onNavigate={onClose}
                top
              />
            ) : (
              <NavSection
                key={entry.group.label}
                label={entry.group.label}
                items={entry.group.items}
                pathname={pathname}
                onNavigate={onClose}
              />
            ),
          )}
        </ul>
      </nav>
    </>
  );
}

function NavSection({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: { label: string; href: string }[];
  pathname: string;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <li className="my-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between py-1 text-left text-xl font-semibold text-neutral-900"
      >
        <span>{label}</span>
        <ChevronDownIcon
          size={20}
          className={cn("transition-transform", expanded ? "" : "-rotate-90")}
        />
      </button>
      {expanded && (
        <ul className="mb-2 flex flex-col pl-3">
          {items.map((item) => (
            <NavLink
              key={item.href}
              label={item.label}
              href={item.href}
              active={pathname === item.href}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function NavLink({
  label,
  href,
  external,
  active,
  onNavigate,
  top,
}: {
  label: string;
  href: string;
  external?: boolean;
  active?: boolean;
  onNavigate: () => void;
  top?: boolean;
}) {
  const className = cn(
    "block truncate py-1 text-xl transition-colors hover:text-neutral-500",
    top ? "my-1 font-semibold" : "",
    active ? "text-[var(--sf-tab-blue)]" : "text-neutral-900",
  );

  if (external) {
    return (
      <li className={top ? "my-1" : ""}>
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {label}
        </a>
      </li>
    );
  }

  return (
    <li className={top ? "my-1" : ""}>
      <Link href={href} onClick={onNavigate} className={className}>
        {label}
      </Link>
    </li>
  );
}
