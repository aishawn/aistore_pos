"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  DEFAULT_STORE_DATE_TIME,
  formatStoreDate,
  formatStoreDateTime,
  storeDateTimeSettingsFromOptions,
  type StoreDateTimeSettings,
} from "@/lib/store-date-time";

type StoreDateTimeContextValue = StoreDateTimeSettings & {
  ready: boolean;
  refresh: () => Promise<void>;
  formatDate: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
};

const StoreDateTimeContext = createContext<StoreDateTimeContextValue | null>(null);

export function StoreDateTimeProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_STORE_DATE_TIME);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!authReady || !user) return;
    setReady(false);
    try {
      const response = await api.get<StoreDateTimeSettings>("/api/retail/registers/store-date-time-options");
      setSettings(storeDateTimeSettingsFromOptions(response));
    } catch {
      // Preserve the last known store settings during a temporary API outage.
    } finally {
      setReady(true);
    }
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setReady(true);
      return;
    }
    void refresh();
  }, [authReady, user, refresh]);

  const value = useMemo<StoreDateTimeContextValue>(() => ({
    ...settings,
    ready,
    refresh,
    formatDate: (date) => formatStoreDate(date, settings),
    formatDateTime: (date) => formatStoreDateTime(date, settings),
  }), [settings, ready, refresh]);

  return <StoreDateTimeContext.Provider value={value}>{children}</StoreDateTimeContext.Provider>;
}

export function useStoreDateTime() {
  const context = useContext(StoreDateTimeContext);
  if (!context) throw new Error("useStoreDateTime must be used inside StoreDateTimeProvider");
  return context;
}
