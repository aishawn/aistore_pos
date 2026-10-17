"use client";

import { useState } from "react";
import { RefreshIcon, DatabaseIcon, DeleteIcon, XIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";

export interface NotificationItem {
  id: string;
  title: string;
  duration: string;
  body: string;
}

/** Real content captured from the live Sell screen notifications panel. */
const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "2048825a-6b11-11f1-bb42-020a2292393f",
    title: "Trial Data Created",
    duration: "14 days ago",
    body: "Trial data has been created for your vendor",
  },
];

/**
 * Orithos header notifications panel — the right slide-in panel opened by
 * clicking the bell icon in the top bar (live: `.notification-bell`). Mirrors
 * sea.onshopfront.com: a 500px white panel (max-w-[90%] on mobile) that slides
 * in from the right below the 50px header, dimming the page behind it (black/40).
 *
 * Header row: "Notifications" + refresh icon on the left, "Delete All" on the
 * right. Each item is a hoverable row with a blue database icon, title,
 * relative timestamp, body text and a trash button.
 */
export function NotificationsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<NotificationItem[]>(DEFAULT_NOTIFICATIONS);
  const [status, setStatus] = useState("");
  useDialogFocus(open, onClose);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — dims the page (black/40), click to close */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black transition-opacity duration-150 ease-in-out",
          open ? "opacity-40" : "pointer-events-none opacity-0",
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        aria-label="Notifications"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-0 right-0 top-[50px] z-50 flex w-[500px] max-w-[90%] flex-col bg-white shadow-md",
          "transition-transform duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-5">
          <div className="flex items-center gap-3">
            <h2 id="notifications-title" className="text-xl text-black">Notifications</h2>
            <button
              type="button"
              aria-label="Refresh notifications"
              onClick={() => {
                setItems(DEFAULT_NOTIFICATIONS);
                setStatus("Notifications refreshed.");
              }}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-md text-neutral-500 outline-none transition-colors hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-[var(--sf-link-blue)]"
            >
              <RefreshIcon size={18} strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-md text-neutral-500 outline-none transition-colors hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-[var(--sf-link-blue)]"
          >
            <XIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => setItems([])}
            className="min-h-11 cursor-pointer rounded-md px-3 text-[16px] font-bold text-neutral-600 transition-colors hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-[var(--sf-link-blue)]"
          >
            Delete All
          </button>
          </div>
        </div>
        <p role="status" aria-live="polite" className="sr-only">{status}</p>

        {/* List */}
        <div className="flex-1 overflow-auto px-2 pb-4">
          {items.length === 0 ? (
            <p className="mt-12 text-center text-neutral-500">
              You have no notifications.
            </p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="group relative">
                <button
                  type="button"
                  data-testid={`notification-${n.id}`}
                  className="flex w-full cursor-pointer items-center rounded-lg bg-transparent p-4 text-left text-black transition-colors hover:bg-black/10"
                >
                  <div className="ml-2 mr-4 text-3xl text-[var(--sf-link-blue)]">
                    <DatabaseIcon size={30} strokeWidth={1.25} />
                  </div>
                  <div className="relative flex-1">
                    <div className="pr-3 text-base [overflow-wrap:anywhere]">
                      {n.title}
                    </div>
                    <div>
                      <span className="text-sm text-neutral-500">
                        {n.duration}
                      </span>
                    </div>
                    <div className="text-sm text-neutral-700">{n.body}</div>
                  </div>
                </button>
                <button
                  type="button"
                  aria-label="Delete notification"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== n.id))}
                  className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-neutral-400 outline-none transition-colors hover:text-neutral-600 focus-visible:ring-2 focus-visible:ring-[var(--sf-link-blue)]"
                >
                  <DeleteIcon size={18} strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
