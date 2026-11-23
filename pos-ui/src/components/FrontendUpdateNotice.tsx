"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import identity from "@/lib/build-identity.json";
import { hasNewFrontendBuild } from "@/lib/frontend-update";

const CHECK_INTERVAL_MS = 60_000;

type VersionResponse = {
  frontend?: { commit?: unknown } | null;
};

export function FrontendUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const currentCommit = identity.commit;

  useEffect(() => {
    if (!currentCommit) return;
    let active = true;
    let checking = false;

    const checkVersion = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/public/version", { cache: "no-store" });
        if (!response.ok) return;
        const version = await response.json() as VersionResponse;
        if (active && hasNewFrontendBuild(currentCommit, version.frontend?.commit)) {
          setUpdateAvailable(true);
        }
      } catch {
        // A transient version check failure should not affect store work.
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };

    void checkVersion();
    const interval = window.setInterval(checkWhenVisible, CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [currentCommit]);

  if (!updateAvailable) return null;

  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      <span>A new Orithos version is available. Refresh after completing your current work.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-400 bg-white px-3 font-medium text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
      >
        <RefreshCw size={15} aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}
