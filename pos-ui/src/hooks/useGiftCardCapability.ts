"use client";
import { useEffect, useState } from "react";
import { getOdooGiftCards } from "@/lib/odoo-api";
import { useAuth } from "@/lib/auth";

export function useGiftCardCapability() {
  const { hasPermission } = useAuth();
  const permitted = hasPermission("customers.gift_cards");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("orithos-gift-capability-refresh", refresh);
    return () => window.removeEventListener("orithos-gift-capability-refresh", refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!permitted) return;
    void Promise.resolve().then(() => {
      if (cancelled) return null;
      setLoading(true); setError(null);
      return getOdooGiftCards(undefined, 0, 1);
    }).then((page) => { if (!cancelled && page) setAvailable(page.available); })
      .catch((cause) => { if (!cancelled) { setAvailable(null); setError(cause instanceof Error ? cause.message : "Could not check gift cards"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [permitted, retry]);
  return { available: permitted ? available : null, error, loading, permitted, refresh: () => window.dispatchEvent(new Event("orithos-gift-capability-refresh")) };
}
