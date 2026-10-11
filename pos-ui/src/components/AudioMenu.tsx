"use client";

import { useState } from "react";
import { VolumeIcon, VolumeLowIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Orithos header audio menu — the dropdown opened by clicking the volume icon in
 * the top bar (live: `.audio-menu`). Mirrors sea.onshopfront.com: a 400px light
 * panel anchored under the icon with two volume channels (Master Volume,
 * Shopfront), each a range slider flanked by volume-down/up icons plus a Mute
 * button. A full-page dim (black/70) sits behind it; click it to close.
 *
 * Audio is not wired in the clone — sliders/mute are visual-only local state.
 */
export function AudioMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop — black 70%, dims the page; click to close */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[2] bg-black/70"
      />

      {/* Dropdown — anchored under the volume icon (its .header-item is relative) */}
      <div
        role="dialog"
        aria-label="Audio settings"
        className="absolute right-0 top-[50px] z-[3] w-[400px] bg-[var(--sf-pad-bg)] p-4 text-neutral-900 shadow-lg"
      >
        <VolumeChannel label="Master Volume" defaultValue={100} />
        <div className="h-6" />
        <VolumeChannel label="Orithopos" defaultValue={100} />
      </div>
    </>
  );
}

function VolumeChannel({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [preMute, setPreMute] = useState(defaultValue);
  const muted = value === 0;

  return (
    <div>
      <p className="text-[16px] text-neutral-900">
        {label}
        <span className="text-[var(--sf-placeholder)]"> - {value}%</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <VolumeLowIcon size={20} strokeWidth={1.5} className="text-neutral-500" />
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label={`${label} volume`}
          className={cn(
            "h-1 w-[264px] cursor-pointer appearance-none rounded",
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:bg-[var(--sf-link-blue)]",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:bg-[var(--sf-link-blue)]",
          )}
          style={{
            background: `linear-gradient(var(--sf-link-blue), var(--sf-link-blue)) no-repeat, var(--sf-muted)`,
            backgroundSize: `${value}% 100%`,
          }}
        />
        <VolumeIcon size={20} strokeWidth={1.5} className="text-neutral-500" />
      </div>
      <button
        type="button"
        onClick={() => {
          if (muted) {
            setValue(preMute || 100);
          } else {
            setPreMute(value);
            setValue(0);
          }
        }}
        className="mt-3 w-[90px] rounded-md border border-solid border-black/90 bg-[var(--sf-pad-bg)] px-2 py-1 text-[14px] text-neutral-900 transition-colors hover:bg-black/5"
      >
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}
