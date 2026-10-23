/**
 * Shared launch destinations for Overview tiles + radial quick menu.
 * Always derived from sidebar navigation so admin filters stay consistent.
 */

import type { SidebarGroup, SidebarIcon, SidebarItem } from "@/lib/sidebar-navigation";

export const LAUNCH_RING_EVENT = "orithos:open-launch-ring";

export type LaunchRingDetail = {
  originX?: number;
  originY?: number;
  company?: string;
  centerCaption?: string;
};

export type LaunchTone = {
  iconBg: string;
  iconFg: string;
  accent: string;
};

export type LaunchChild = {
  label: string;
  href: string;
  hint?: string;
};

export type LaunchDestination = {
  id: string;
  label: string;
  href: string;
  icon: SidebarIcon;
  tone: LaunchTone;
  hint: string;
  children?: LaunchChild[];
  featured?: boolean;
};

const TONES: Record<string, LaunchTone> = {
  sell: { iconBg: "rgba(37, 99, 235, 0.12)", iconFg: "#1d4ed8", accent: "#2563eb" },
  stock: { iconBg: "rgba(5, 150, 105, 0.12)", iconFg: "#047857", accent: "#059669" },
  customers: { iconBg: "rgba(2, 132, 199, 0.12)", iconFg: "#0369a1", accent: "#0284c7" },
  ai: { iconBg: "rgba(190, 24, 93, 0.12)", iconFg: "#9d174d", accent: "#be185d" },
  overview: { iconBg: "rgba(79, 70, 229, 0.12)", iconFg: "#4338ca", accent: "#4f46e5" },
  reports: { iconBg: "rgba(99, 102, 241, 0.14)", iconFg: "#4338ca", accent: "#6366f1" },
  setup: { iconBg: "rgba(71, 85, 105, 0.12)", iconFg: "#334155", accent: "#475569" },
};

function isGroup(entry: SidebarItem | SidebarGroup): entry is SidebarGroup {
  return "items" in entry;
}

function toneFor(label: string, icon: SidebarIcon): LaunchTone {
  const key = label.toLowerCase();
  if (key.includes("sell") || icon === "sales") return TONES.sell;
  if (key.includes("stock") || icon === "inventory") return TONES.stock;
  if (key.includes("customer") || icon === "customers") return TONES.customers;
  if (key.includes("ai") || key.includes("sommelier") || icon === "sommelier") return TONES.ai;
  if (key.includes("overview") || icon === "overview") return TONES.overview;
  if (key.includes("report") || icon === "reporting") return TONES.reports;
  return TONES.setup;
}

function hintFor(label: string, children?: LaunchChild[]): string {
  if (children?.length) {
    return children
      .slice(0, 3)
      .map((child) => child.label)
      .join(" · ");
  }
  if (label === "Sell") return "Open the register";
  if (label === "Overview") return "Store launcher";
  if (label === "Reports") return "Sales pulse & trends";
  return "Open";
}

/** Flatten sidebar entries into launch destinations (max one level of children). */
export function buildLaunchDestinations(
  navigation: (SidebarItem | SidebarGroup)[],
): LaunchDestination[] {
  return navigation.map((entry) => {
    if (isGroup(entry)) {
      const children = entry.items
        .filter((item) => !item.more)
        .map((item) => ({
          label: item.label,
          href: item.href,
          hint: item.hint,
        }));
      return {
        id: entry.label.toLowerCase().replace(/\s+/g, "-"),
        label: entry.label,
        href: children[0]?.href ?? "#",
        icon: entry.icon,
        tone: toneFor(entry.label, entry.icon),
        hint: hintFor(entry.label, children),
        children,
        featured: false,
      };
    }
    return {
      id: entry.label.toLowerCase().replace(/\s+/g, "-"),
      label: entry.label,
      href: entry.href,
      icon: entry.icon,
      tone: toneFor(entry.label, entry.icon),
      hint: hintFor(entry.label),
      featured: entry.label === "Sell",
    };
  });
}

export function openLaunchRing(detail?: LaunchRingDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LAUNCH_RING_EVENT, { detail: detail ?? {} }));
}
