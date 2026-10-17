"use client";

import { useState } from "react";
import {
  MapPinIcon,
  GlobeIcon,
  RegisterIcon,
  ArrowLeftIcon,
} from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/**
 * Orithos location selector — the full-screen modal opened by the header
 * signpost icon (live: `#location-header`). Mirrors sea.onshopfront.com: a
 * two-step wizard over a stone→zinc diagonal gradient, with a centred white
 * card. Step 1 picks the outlet, Step 2 picks the register.
 *
 * On the live site this is a required selection flow (no backdrop dismiss); in
 * the clone, picking a register — or the Escape key via the caller — closes it.
 */
export function LocationSelector({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"outlet" | "register">("outlet");
  const [outlet, setOutlet] = useState("11");
  const close = () => {
    setStep("outlet");
    onClose();
  };
  useDialogFocus(open, close);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-linear-to-br from-stone-500 to-zinc-800 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="location-selector-title">
      <div className="max-h-full w-full overflow-auto">
        <div className="relative mx-auto w-full max-w-[520px] rounded-lg bg-white p-5 pt-12 shadow-2xl sm:p-8 sm:pt-12">
          {step === "register" && (
            <button
              type="button"
              onClick={() => setStep("outlet")}
              className="absolute left-4 top-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:left-6 sm:top-4"
            >
              <ArrowLeftIcon size={18} strokeWidth={1.5} />
              Back to outlet select
            </button>
          )}

          <h2 id="location-selector-title" className="text-xl font-bold text-neutral-900">Location Selector</h2>
          <p className="mt-1 max-w-md text-neutral-800">
            Please select which location best describes where your device is
            located.
          </p>

          <div className="pt-8">
            {step === "outlet" ? (
              <>
                <p className="mb-4 text-neutral-900">
                  Which outlet are you currently in?
                </p>
                <OptionCard
                  icon={<MapPinIcon size={22} strokeWidth={1.5} />}
                  label="11"
                  sublabel="(Previously Selected)"
                  onClick={() => {
                    setOutlet("11");
                    setStep("register");
                  }}
                />
                <OptionCard
                  icon={<GlobeIcon size={22} strokeWidth={1.5} />}
                  label="Not at an Outlet"
                  sublabel="(Global Mode)"
                  onClick={() => {
                    setOutlet("Global");
                    setStep("register");
                  }}
                />
              </>
            ) : (
              <>
                <p className="mb-4 text-neutral-900">
                  Which register are you currently using at {outlet}?
                </p>
                <OptionCard
                  icon={<RegisterIcon size={22} strokeWidth={1.5} />}
                  label="Register #1"
                  sublabel="(Previously Selected)"
                  onClick={close}
                />
                <OptionCard
                  icon={<MapPinIcon size={22} strokeWidth={1.5} />}
                  label="Not using a register"
                  onClick={close}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionCard({
  icon,
  label,
  sublabel,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 flex min-h-16 w-full min-w-0 cursor-pointer items-center rounded-lg border-2 border-gray-200 p-4 text-left shadow transition-all hover:border-gray-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
    >
      <span className="mr-2 text-xl text-neutral-700">{icon}</span>
      <span className="text-neutral-900">
        {label}
        {sublabel && (
          <span className="block text-sm text-[var(--sf-link-blue)]">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}
