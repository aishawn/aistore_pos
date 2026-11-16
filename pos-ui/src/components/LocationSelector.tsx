"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapPinIcon,
  GlobeIcon,
  RegisterIcon,
  ArrowLeftIcon,
} from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { api, apiFailureMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { writeRegisterContext } from "@/lib/work-context";

type OutletRow = { id: number; name: string };
type RegisterRow = { id: number; name: string; outletId?: number };

export function LocationSelector({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, setWorkContext } = useAuth();
  const [step, setStep] = useState<"outlet" | "register">("outlet");
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [registers, setRegisters] = useState<RegisterRow[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);
  const [globalMode, setGlobalMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    setStep("outlet");
    setError(null);
    onClose();
  }, [onClose]);
  useDialogFocus(open, close);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [outletRows, registerRows] = await Promise.all([
          api.get<OutletRow[]>("/api/outlets"),
          api.get<RegisterRow[]>("/api/registers"),
        ]);
        if (cancelled) return;
        setOutlets(Array.isArray(outletRows) ? outletRows : []);
        setRegisters(Array.isArray(registerRows) ? registerRows : []);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load locations");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function applyContext(outletId: number, registerId: number | null, isGlobal: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setWorkContext({
        outletId,
        registerId,
        globalMode: isGlobal,
      });
      writeRegisterContext(registerId, isGlobal);
      close();
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not update your location.", "Session expired"));
    } finally {
      setBusy(false);
    }
  }

  async function pickOutlet(outletId: number, isGlobal: boolean) {
    if (isGlobal) {
      const fallback = user?.outletId ?? outlets[0]?.id;
      if (fallback) {
        await applyContext(fallback, null, true);
      }
      return;
    }
    setSelectedOutletId(outletId);
    setGlobalMode(false);
    setStep("register");
  }

  const outletRegisters = selectedOutletId == null
    ? []
    : registers.filter((row) => Number(row.outletId) === selectedOutletId);

  const selectedOutletName = outlets.find((row) => row.id === selectedOutletId)?.name
    ?? (globalMode ? "Global" : "Outlet");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-linear-to-br from-stone-500 to-zinc-800 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="location-selector-title">
      <div className="max-h-full w-full overflow-auto">
        <div className="relative mx-auto w-full max-w-[520px] rounded-lg bg-white p-5 pt-12 shadow-2xl sm:p-8 sm:pt-12">
          {step === "register" && (
            <button
              type="button"
              onClick={() => setStep("outlet")}
              disabled={busy}
              className="absolute left-4 top-3 flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:left-6 sm:top-4"
            >
              <ArrowLeftIcon size={18} strokeWidth={1.5} />
              Back to outlet select
            </button>
          )}

          <h2 id="location-selector-title" className="text-xl font-bold text-neutral-900">Location Selector</h2>
          <p className="mt-1 max-w-md text-neutral-800">
            Select which outlet and register describe where this device is working.
          </p>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

          <div className="pt-8">
            {loading ? (
              <p role="status" className="text-sm text-neutral-600">Loading outlets and registers…</p>
            ) : step === "outlet" ? (
              <>
                <p className="mb-4 text-neutral-900">Which outlet are you currently in?</p>
                {outlets.map((outlet) => (
                  <OptionCard
                    key={outlet.id}
                    icon={<MapPinIcon size={22} strokeWidth={1.5} />}
                    label={outlet.name}
                    sublabel={user?.outletId === outlet.id ? "(Current session outlet)" : undefined}
                    disabled={busy}
                    onClick={() => void pickOutlet(outlet.id, false)}
                  />
                ))}
                {outlets.length > 1 && (
                  <OptionCard
                    icon={<GlobeIcon size={22} strokeWidth={1.5} />}
                    label="Not at an Outlet"
                    sublabel="(Global Mode)"
                    disabled={busy}
                    onClick={() => void pickOutlet(0, true)}
                  />
                )}
              </>
            ) : (
              <>
                <p className="mb-4 text-neutral-900">
                  Which register are you using at {selectedOutletName}?
                </p>
                {outletRegisters.map((register) => (
                  <OptionCard
                    key={register.id}
                    icon={<RegisterIcon size={22} strokeWidth={1.5} />}
                    label={register.name}
                    disabled={busy}
                    onClick={() => {
                      if (selectedOutletId != null) {
                        void applyContext(selectedOutletId, register.id, false);
                      }
                    }}
                  />
                ))}
                <OptionCard
                  icon={<MapPinIcon size={22} strokeWidth={1.5} />}
                  label="Not using a register"
                  disabled={busy}
                  onClick={() => {
                    if (selectedOutletId != null) {
                      void applyContext(selectedOutletId, null, globalMode);
                    }
                  }}
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
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-4 flex min-h-16 w-full min-w-0 cursor-pointer items-center rounded-lg border-2 border-gray-200 p-4 text-left shadow transition-all hover:border-gray-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"
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