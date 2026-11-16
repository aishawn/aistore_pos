"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { LocationSelector } from "@/components/LocationSelector";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isGlobalWorkMode, readRegisterId } from "@/lib/work-context";

type OutletRow = { id: number; name: string };
type RegisterRow = { id: number; name: string; outletId?: number };

export function LocationHeaderControl() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("Location");

  useEffect(() => {
    if (!ready || !user?.outletId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [outlets, registers] = await Promise.all([
          api.get<OutletRow[]>("/api/outlets"),
          api.get<RegisterRow[]>("/api/registers"),
        ]);
        if (cancelled) return;
        const outlet = outlets.find((row) => row.id === user.outletId);
        const registerId = readRegisterId();
        const register = registerId
          ? registers.find((row) => row.id === registerId)
          : undefined;
        if (isGlobalWorkMode()) {
          setLabel("Global mode");
        } else if (outlet && register) {
          setLabel(`${outlet.name} · ${register.name}`);
        } else if (outlet) {
          setLabel(outlet.name);
        }
      } catch {
        if (!cancelled) setLabel("Location");
      }
    })();
    return () => { cancelled = true; };
  }, [ready, user?.outletId]);

  if (!ready) return null;

  return (
    <>
      <button
        type="button"
        id="location-header"
        title={label}
        aria-label={`Current location: ${label}. Change location.`}
        onClick={() => setOpen(true)}
        className="inline-flex max-w-[12rem] min-h-11 cursor-pointer items-center gap-1.5 truncate rounded-lg px-2 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:max-w-[16rem]"
      >
        <MapPin size={18} strokeWidth={1.6} className="shrink-0 text-[var(--oh-muted)]" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      <LocationSelector open={open} onClose={() => setOpen(false)} />
    </>
  );
}