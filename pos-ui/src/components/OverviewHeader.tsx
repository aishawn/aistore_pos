"use client";

import { OrithosLogo } from "@/components/OrithosLogo";
import { OverviewAccountControl } from "@/components/OverviewAccountControl";
import { OverviewLayoutSwitcher } from "@/components/OverviewLayoutSwitcher";

export function OverviewHeader({
  greeting,
  company,
  active,
}: {
  greeting: string;
  company: string;
  active: "radial" | "workspace";
}) {
  return (
    <header className="ov-header">
      <div className="ov-heading min-w-0">
        <div className="ov-brand"><OrithosLogo /></div>
        <p className="ov-eyebrow">{greeting}</p>
        <h1 title={company}>
          {active === "workspace"
            ? <><span>Your store, </span><em>at a glance.</em></>
            : <><span>Your store. </span><em>One intelligence.</em></>}
        </h1>
        {active === "radial" ? <p className="ov-tagline">Sell smarter. Manage better. Grow further with Orithos AI.</p> : null}
      </div>
      <div className="ov-toolbar">
        <OverviewLayoutSwitcher active={active} />
        <OverviewAccountControl showLogo={false} />

      </div>
    </header>
  );
}
