"use client";

import { useEffect, useRef } from "react";
import { clearOdooReadCache } from "@/lib/odoo-read-cache";
import { fetchShopfrontSyncStamp, readShopfrontSyncStamp } from "@/lib/shopfront-sync-stamp";

export function useShopfrontSyncRefresh(onSync: () => void) {
  const callback = useRef(onSync);
  const seenStamp = useRef<number | null>(null);
  useEffect(() => { callback.current = onSync; }, [onSync]);

  useEffect(() => {
    seenStamp.current = readShopfrontSyncStamp();
    const refresh = (stamp: number) => {
      if (!Number.isFinite(stamp) || stamp <= 0 || (seenStamp.current !== null && stamp <= seenStamp.current)) return;
      seenStamp.current = stamp;
      clearOdooReadCache();
      callback.current();
    };
    const onSync = (event: Event) => {
      const stamp = Number((event as CustomEvent<{ at?: unknown }>).detail?.at);
      refresh(stamp);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "orithos-shopfront-sync-at-v1" && event.newValue) refresh(Number(event.newValue));
    };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const stamp = await fetchShopfrontSyncStamp();
      if (stamp) refresh(stamp);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("orithos-shopfront-sync", onSync);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), 60_000);
    void check();
    return () => {
      window.removeEventListener("orithos-shopfront-sync", onSync);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);
}
