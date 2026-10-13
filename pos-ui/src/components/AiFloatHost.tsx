"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SellAiPanel } from "@/components/SellAiPanel";
import { useAiAssistant } from "@/lib/ai-assistant";
import { getUiMode } from "@/lib/ui-mode";

/** Routes (and nested paths) that show the floating Orithos AI entry. */
const AI_FLOAT_PREFIXES = [
  "/overview",
  "/products",
  "/classifications",
  "/suppliers",
  "/orders",
  "/stocktake",
  "/stock/list",
  "/stock/external-stocktake",
  "/stocktake/external",
  "/stock/capped-pricing",
  "/stock/bulk-price-edit",
  "/stock/import-supplier-products",
  "/stock/buying-periods",
  "/customers",
  "/customer-groups",
  "/pricelists",
  "/giftcards",
  "/reports",
] as const;

export function shouldShowAiFloat(pathname: string): boolean {
  if (pathname === "/sommelier" || pathname.startsWith("/sommelier/")) return false;
  if (pathname === "/invoices/scan" || pathname.startsWith("/invoices/")) return false;
  // Sell home (/) and mobile AI home (/m) use the same floating AI entry.
  if (pathname === "/" || pathname === "/m" || pathname === "/finalise") return true;
  return AI_FLOAT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Global floating AI host — mounts on inventory / sell / report routes via AppShell. */
export function AiFloatHost() {
  const pathname = usePathname();
  const { expanded, setExpanded } = useAiAssistant();

  useEffect(() => {
    if (getUiMode() === "mobile" && pathname === "/m") {
      setExpanded(false);
    }
  }, [pathname, setExpanded]);

  if (!shouldShowAiFloat(pathname)) return null;

  return (
    <SellAiPanel
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}
