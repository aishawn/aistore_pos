"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  DEFAULT_STORE_DATE_TIME,
  formatStoreDate,
  formatStoreDateTime,
  storeDateTimeSettingsFromCompanyBundle,
  type StoreDateTimeSettings,
} from "@/lib/store-date-time";

type CompanySettingsBundle = Record<string, { value?: string | null }>;
type StoreDateTimeContextValue = StoreDateTimeSettings & {
  ready: boolean;
  refresh: () => Promise<void>;
  formatDate: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
};

const StoreDateTimeContext = createContext<StoreDateTimeContextValue | null>(null);

export function StoreDateTimeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_STORE_DATE_TIME);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<CompanySettingsBundle>("/api/settings/company");
      setSettings(storeDateTimeSettingsFromCompanyBundle(response));
    } catch {
      // Keep the last known values when company settings are unavailable.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
