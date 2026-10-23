"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RadialPie } from "@/components/RadialPie";
import { useAuth } from "@/lib/auth";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";
import { cn } from "@/lib/utils";

export function OverviewRadialHome({
  greeting,
  company,
  centerCaption,
  className,
}: {
  greeting: string;
  company: string;
  centerCaption: string;
  className?: string;
}) {
  const { user } = useAuth();
  const destinations = buildLaunchDestinations(
    getSidebarNavigation({ isAdmin: Boolean(user?.isAdmin) }),
  ).filter((item) => item.id !== "overview");

  return (
    <section
      aria-label="Store launcher"
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px]",
        "bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.95)_0%,_rgba(239,246,255,0.9)_42%,_rgba(245,247,250,0.95)_100%)]",
        "ring-1 ring-black/5",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(37,99,235,0.08), transparent 40%), radial-gradient(circle at 80% 75%, rgba(190,24,93,0.06), transparent 35%)",
        }}
      />

      <header className="relative z-10 flex shrink-0 flex-wrap items-end justify-between gap-3 px-4 pb-1 pt-4 sm:px-6">
        <div className="min-w-0">
          <p className="oh-type-meta text-[var(--oh-muted)]">{company}</p>
          <h1 className="oh-type-title mt-0.5 text-[var(--oh-text)]">{greeting}</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Point at a destination · click to open</p>
        </div>
        <Link
          href="/reports/dashboard"
          className="oh-type-meta inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--oh-border)] bg-white/80 px-3 font-semibold text-[var(--oh-text)] no-underline shadow-sm backdrop-blur hover:bg-white"
        >
          View reports <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-2 pb-6 pt-2">
        <RadialPie
          destinations={destinations}
          centerTitle={company}
          centerCaption={centerCaption}
          centerHref="/reports/dashboard"
          variant="page"
          entered
        />
      </div>
    </section>
  );
}
