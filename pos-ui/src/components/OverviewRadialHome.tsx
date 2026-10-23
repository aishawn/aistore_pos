"use client";

import { RadialPie } from "@/components/RadialPie";
import { useAuth } from "@/lib/auth";
import { buildLaunchDestinations } from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";
import { cn } from "@/lib/utils";

export function OverviewRadialHome({
  greeting,
  company,
  centerCaption,
  centerHint,
  className,
}: {
  greeting: string;
  company: string;
  centerCaption: string;
  centerHint?: string;
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
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px]",
        "bg-[radial-gradient(ellipse_at_50%_42%,_#ffffff_0%,_#f0f5fc_55%,_#eef2f7_100%)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 38%, rgba(37,99,235,0.07), transparent 42%)",
        }}
      />

      <header className="relative z-10 shrink-0 px-5 pb-0 pt-5 sm:px-7 sm:pt-6">
        <p className="oh-type-meta text-[var(--oh-muted)]">{company}</p>
        <h1 className="mt-1 text-[1.35rem] font-semibold tracking-tight text-[var(--oh-text)] sm:text-[1.5rem]">
          {greeting}
        </h1>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-2 pb-8 pt-2">
        <RadialPie
          destinations={destinations}
          centerTitle={company}
          centerCaption={centerCaption}
          centerHint={centerHint}
          centerHref="/reports/dashboard"
          variant="page"
          entered
        />
      </div>
    </section>
  );
}
