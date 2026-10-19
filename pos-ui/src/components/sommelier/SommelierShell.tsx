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
    <div className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)] text-[var(--oh-text)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div>
            {!onHome && (
              <Link
                href={homeHref}
                className="mb-2 inline-flex text-[13px] font-semibold text-[var(--oh-primary)]"
              >
                Wine Assistant
              </Link>
            )}
            <div className="flex items-center gap-2">
              <Wine size={21} strokeWidth={1.8} className="text-[var(--oh-primary)]" />
              <h1 className="text-[20px] font-semibold tracking-tight sm:text-[24px]">
                {title ?? "Wine Assistant"}
              </h1>
            </div>
            {subtitle ? (
              <p className="mt-1 max-w-xl text-[14px] leading-5 text-[var(--oh-muted)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </div>
    </div>
  );
}
