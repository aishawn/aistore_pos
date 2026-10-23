"use client";

import { useEffect, useMemo, useState } from "react";
import { OverviewRadialMenu } from "@/components/OverviewRadialMenu";
import { useAuth } from "@/lib/auth";
import {
  LAUNCH_RING_EVENT,
  buildLaunchDestinations,
  type LaunchRingDetail,
} from "@/lib/overview-launch";
import { getSidebarNavigation } from "@/lib/sidebar-navigation";

export function LaunchRingHost() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<LaunchRingDetail>({});

  const destinations = useMemo(
    () => buildLaunchDestinations(getSidebarNavigation({
      isAdmin: Boolean(user?.isAdmin),
      hasPermission: (safeName) => Boolean(user?.isAdmin) || (user?.permissions ?? []).includes(safeName),
    })),
    [user?.isAdmin, user?.permissions],
  );

  useEffect(() => {
    function onOpen(event: Event) {
      const custom = event as CustomEvent<LaunchRingDetail>;
      setDetail(custom.detail ?? {});
      setOpen(true);
    }
    window.addEventListener(LAUNCH_RING_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(LAUNCH_RING_EVENT, onOpen as EventListener);
  }, []);

  return (
    <OverviewRadialMenu
      open={open}
      destinations={destinations}
      detail={detail}
      onClose={() => setOpen(false)}
    />
  );
}
