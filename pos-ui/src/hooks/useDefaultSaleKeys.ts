"use client";

import { useMemo } from "react";
import { useApi } from "@/hooks/useApi";
import { parseSaleKeys } from "@/lib/sale-keys-data";
import type { SaleKey } from "@/types/orithos";

interface SaleKeysSet {
  id: number;
  name: string;
  saleKeys?: string | SaleKey[] | null;
}

const DEFAULT_SET_NAME = "Home Keys";

/** Load the default sale-keys layout for the Sell screen. */
export function useDefaultSaleKeys() {
  const { data: sets, loading, error, reload } = useApi<SaleKeysSet[]>("/api/sale-keys");

  const activeSet = useMemo(() => {
    if (!sets?.length) return null;
    return sets.find((set) => set.name === DEFAULT_SET_NAME) ?? sets[0];
  }, [sets]);

  const keys = useMemo(() => parseSaleKeys(activeSet?.saleKeys), [activeSet]);

  return {
    keys,
    setName: activeSet?.name ?? DEFAULT_SET_NAME,
    loading,
    error,
    reload,
  };
}
