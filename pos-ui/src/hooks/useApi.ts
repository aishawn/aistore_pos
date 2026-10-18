"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const requestSequence = useRef(0);

  const key = JSON.stringify({ path, query });

  const run = useCallback(() => {
    const sequence = ++requestSequence.current;
    if (!path) {
      // Drop tenant-scoped data immediately when auth or route state disables the request.
      // Keeping the previous response here can briefly expose stale data during sign-out
      // or a tenant switch before the parent page unmounts.
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<T>(path, query as Record<string, string | number | boolean | null | undefined>)
      .then((d) => {
        if (sequence === requestSequence.current) setData(d);
      })
      .catch((e: unknown) => {
        if (sequence === requestSequence.current) {
          setError(e instanceof ApiError ? e.message : "Failed to load data");
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
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

export interface CustomerRecentSaleLine {
  timestamp: string;
  userName?: string;
  quantity?: number | null;
  item?: string;
  price?: number | null;
}

interface SaleListItem {
  id: string;
  createdAt?: string;
  userName?: string;
}

interface SaleDetail extends SaleListItem {
  items?: Array<{
    quantity?: number | null;
    note?: string;
    totalPrice?: number | null;
  }>;
}

async function loadRecentSaleLines(customerId: string, limit = 10): Promise<CustomerRecentSaleLine[]> {
  try {
    return await api.get<CustomerRecentSaleLine[]>(`/api/customers/${customerId}/recent-sales`, { limit });
  } catch (e) {
    const missingEndpoint =
      e instanceof ApiError &&
      (e.message.includes("static resource") || e.message.includes("recent-sales") || e.status === 404);
    if (!missingEndpoint) throw e;
  }

  const page = await api.get<Page<SaleListItem>>("/api/sales", { customerId, page: 1, size: limit });
  const lines: CustomerRecentSaleLine[] = [];
  for (const sale of page.items) {
    const detail = await api.get<SaleDetail>(`/api/sales/${sale.id}`);
    for (const item of detail.items ?? []) {
      lines.push({
        timestamp: sale.createdAt ?? "",
        userName: sale.userName,
        quantity: item.quantity,
        item: item.note,
        price: item.totalPrice,
      });
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

/** Recent sale line items for a customer detail page (with sales API fallback). */
export function useRecentCustomerSales(customerId: string | null, enabled = true) {
  const [data, setData] = useState<CustomerRecentSaleLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const key = `${customerId ?? ""}-${enabled}`;

  const run = useCallback(() => {
    const sequence = ++requestSequence.current;
    if (!customerId || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loadRecentSaleLines(customerId)
      .then((items) => {
        if (sequence === requestSequence.current) setData(items);
      })
      .catch((e: unknown) => {
        if (sequence === requestSequence.current) {
          setError(e instanceof ApiError ? e.message : "Failed to load sales");
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, reload: run };
}
