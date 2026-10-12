"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AI_CREATE_PARAM, consumeAiCreatePrefill } from "@/lib/ai-create-prefill";

/**
 * When AI navigates with ?create=1, open create UI once, consume sessionStorage
 * prefill, and strip the query param.
 */
export function useAiCreateOpen<T extends object>(
  entity: string,
): {
  creating: boolean;
  setCreating: (open: boolean) => void;
  initial: T | null;
  clearInitial: () => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const [initial, setInitial] = useState<T | null>(null);

  const clearInitial = useCallback(() => setInitial(null), []);

  useEffect(() => {
    if (searchParams.get(AI_CREATE_PARAM) !== "1") return;
    const prefill = consumeAiCreatePrefill<T>(entity);
    if (prefill) setInitial(prefill);
    setCreating(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(AI_CREATE_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [entity, searchParams, pathname, router]);

  return { creating, setCreating, initial, clearInitial };
}
