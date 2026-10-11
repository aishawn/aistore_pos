"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, Page } from "@/lib/api";

/** Debounce a fast-changing value (e.g. a search box) before using it as a query. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Fetch any GET endpoint, re-running when `deps` change. */
export function useApi<T>(path: string | null, query?: Record<string, unknown>): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify({ path, query });

  const run = useCallback(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<T>(path, query as Record<string, string | number | boolean | null | undefined>)
      .then((d) => setData(d))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Failed to load data"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, reload: run };
}

/** Convenience wrapper for paged list endpoints. */
export function useApiList<T>(path: string | null, query?: Record<string, unknown>) {
  const state = useApi<Page<T>>(path, query);
  return { ...state, items: state.data?.items ?? [], total: state.data?.total ?? 0 };
}
