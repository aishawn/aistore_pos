"use client";

import { OrithosLogo } from "@/components/OrithosLogo";
import { OverviewAccountControl } from "@/components/OverviewAccountControl";
import { OverviewLayoutSwitcher } from "@/components/OverviewLayoutSwitcher";
import { LocationHeaderControl } from "@/components/LocationHeaderControl";
import type { OverviewDashboardAlertProps } from "@/components/OverviewDashboardAlert";
import { OverviewDashboardAlert } from "@/components/OverviewDashboardAlert";

export function OverviewHeader({
  company,
  active,
  alert,
}: {
  company: string;
  active: "radial" | "workspace";
  alert?: OverviewDashboardAlertProps | null;
}) {
  return (
    <header className="ov-header">
      <div className="ov-heading min-w-0">
        <div className="ov-brand"><OrithosLogo /></div>
        <h1 title={company} className="ov-header-title">
          {active === "workspace"
            ? <><span className="ov-title-line">Your store, </span><em className="ov-title-line">at a glance.</em></>
            : <><span className="ov-title-line">Your store. </span><em className="ov-title-line">One intelligence.</em></>}
        </h1>
        {active === "radial" ? <p className="ov-tagline">Sell smarter. Manage better. Grow further with Orithos AI.</p> : null}
      </div>
      <div className="ov-toolbar">
        {alert ? <OverviewDashboardAlert {...alert} /> : null}
        <LocationHeaderControl />
        <OverviewLayoutSwitcher active={active} />
        <OverviewAccountControl showLogo={false} />

      </div>
    </header>
  );
}
