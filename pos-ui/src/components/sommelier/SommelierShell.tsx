"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wine } from "lucide-react";
import { getUiMode } from "@/lib/ui-mode";

export function SommelierShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const mobile = getUiMode() === "mobile";
  const homeHref = mobile ? "/m" : "/sommelier";
  const onHome = pathname === "/sommelier" || pathname === "/m";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1a1020] text-white">
      <header className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            {!onHome && (
              <Link
                href={homeHref}
                className="mb-2 inline-flex text-[13px] font-medium uppercase tracking-[0.16em] text-[#f39200]"
              >
                Orion Sommelier
              </Link>
            )}
            <div className="flex items-center gap-2">
              <Wine size={22} strokeWidth={1.6} className="text-[#f39200]" />
              <h1 className="text-[22px] font-medium tracking-tight sm:text-[26px]">
                {title ?? "Orion Sommelier"}
              </h1>
            </div>
            {subtitle ? (
              <p className="mt-1 max-w-xl text-[13px] leading-5 text-white/65">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </div>
    </div>
  );
}
