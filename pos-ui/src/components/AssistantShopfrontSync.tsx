"use client";

import { useEffect, useState } from "react";
import { fetchShopfrontSyncStamp } from "@/lib/shopfront-sync-stamp";

const melbourneTime = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AssistantShopfrontSync() {
  const [stamp, setStamp] = useState<number | null | undefined>();

  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      const at = await fetchShopfrontSyncStamp();
      pending = false;
      if (active) setStamp(at);
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (stamp === undefined) return null;
  const time = stamp == null ? null : new Date(stamp);
  return (
    <p className="min-w-0 px-2 text-xs text-[var(--oh-muted)]">
      {time && Number.isFinite(time.getTime()) ? (
        <>Shopfront sync reported <time dateTime={time.toISOString()}>{melbourneTime.format(time)}</time> (Melbourne)</>
      ) : "Shopfront sync time unavailable"}
    </p>
  );
}
