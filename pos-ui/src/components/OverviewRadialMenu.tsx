"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { RadialPie, useIsCompactViewport } from "@/components/RadialPie";
import type {
  LaunchDestination,
  LaunchRingDetail,
} from "@/lib/overview-launch";
import { cn } from "@/lib/utils";

export function OverviewRadialMenu({
  open,
  destinations,
  detail,
  onClose,
}: {
  open: boolean;
  destinations: LaunchDestination[];
  detail: LaunchRingDetail;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const compact = useIsCompactViewport();
  const [entered, setEntered] = useState(false);

  useDialogFocus(open, onClose, open ? "launch-ring" : null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(open));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const company = detail.company?.trim() || "Orithos";
  const caption = detail.centerCaption?.trim() || "Choose a destination";
  const ringDestinations = destinations.filter(
    (item) => item.id !== "overview",
  );
  const listMode = compact;

  return (
    <div className="fixed inset-0 z-[80] print:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close quick menu"
        className={cn(
          "absolute inset-0 bg-slate-950/40 backdrop-blur-xl backdrop-saturate-150 transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0",
          "motion-reduce:transition-none",
        )}
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Store quick menu"
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[88dvh] overflow-y-auto rounded-[28px]",
          listMode
            ? "max-h-[min(88vh,40rem)] w-[min(100vw-1.5rem,28rem)] overflow-y-auto rounded-[28px] bg-white p-4 shadow-2xl"
            : "h-[min(88dvh,40rem)] w-[min(94vw,64rem)]",
        )}
      >
        <RadialPie
          destinations={ringDestinations}
          centerTitle={company}
          centerCaption={caption}
          centerHref={
            destinations.some((item) => item.id === "reports")
              ? "/reports/dashboard?period=last_7_days"
              : undefined
          }
          onNavigate={onClose}
          entered={entered}
          variant="modal"
        />
        {listMode ? (
          <button
            type="button"
            onClick={onClose}
            className="oh-type-label mt-3 inline-flex h-11 w-full items-center justify-center rounded-full border border-[var(--oh-border)] font-semibold text-[var(--oh-text)]"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
