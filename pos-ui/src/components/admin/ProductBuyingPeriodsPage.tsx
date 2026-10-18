"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { FrownIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { api } from "@/lib/api";
import { useDialogFocus } from "@/hooks/useDialogFocus";

interface BuyingPeriod {
  id: string;
  itemId?: string | null;
  itemType?: string | null;
  outletId?: string | null;
  supplierId?: string | null;
  start?: string | null;
  end?: string | null;
  quantity?: number | null;
  cost?: number | null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function CreateBuyingPeriodModal({
  open,
  onClose,
  onCreated,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initial?: {
    start?: string;
    end?: string;
    quantity?: string;
    cost?: string;
  } | null;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setStart(initial?.start ?? "");
    setEnd(initial?.end ?? "");
    setQuantity(initial?.quantity ?? "1");
    setCost(initial?.cost ?? "");
    setError(null);
  }, [open, initial]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "create-buying-period", cancelRef);

  if (!open) return null;

  async function submit() {
    if (!start || !end) {
      setError("Start and end dates are required.");
      return;
    }
    if (end < start) {
      setError("End date must be on or after the start date.");
      return;
    }
    const quantityValue = Number(quantity);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    const costValue = cost.trim() === "" ? null : Number(cost);
    if (costValue !== null && (!Number.isFinite(costValue) || costValue < 0)) {
      setError("Cost must be zero or greater.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/buying-periods", {
        itemType: "PRODUCT",
        start: start ? `${start}T00:00:00` : null,
        end: end ? `${end}T23:59:59` : null,
        quantity: quantityValue,
        cost: costValue,
      });
      onCreated();
      onClose();
      setStart("");
      setEnd("");
      setQuantity("1");
      setCost("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create buying period");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-[20px] font-bold text-black">Create Buying Period</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-[13px] font-medium text-neutral-700">
            Start Date
            <div className="mt-1">
              <FormDatePicker
                value={start}
                onChange={setStart}
                placeholder="YYYY / MM / DD"
              />
            </div>
          </label>
          <label className="block text-[13px] font-medium text-neutral-700">
            End Date
            <div className="mt-1">
              <FormDatePicker
                value={end}
                onChange={setEnd}
                placeholder="YYYY / MM / DD"
              />
            </div>
          </label>
          <label className="block text-[13px] font-medium text-neutral-700">
            Quantity
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 h-[38px] w-full rounded border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#6eb5e0]"
            />
          </label>
          <label className="block text-[13px] font-medium text-neutral-700">
            Cost
            <input
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="mt-1 h-[38px] w-full rounded border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#6eb5e0]"
            />
          </label>
          {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded border border-neutral-300 px-4 py-2 text-[14px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded bg-[#5cb3e0] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product buying periods list with empty state. */
export function ProductBuyingPeriodsPage() {
  return (
    <Suspense fallback={null}>
      <ProductBuyingPeriodsPageInner />
    </Suspense>
  );
}

function ProductBuyingPeriodsPageInner() {
  const { creating, setCreating, initial, clearInitial } = useAiCreateOpen<{
    start: string;
    end: string;
    quantity: string;
    cost: string;
  }>("buying_period");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = DEFAULT_PAGE_SIZE;
  const { items, total, loading, error, reload } = useApiList<BuyingPeriod>("/api/buying-periods", {
    page,
    size: PAGE_SIZE,
  });
  const empty = !loading && !error && total === 0;

  function openCreate() {
    clearInitial();
    setCreating(true);
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans md:p-8">
      {loading || error ? (
        <AsyncState loading={loading} error={error} empty={false} onRetry={reload}>
          {null}
        </AsyncState>
      ) : empty ? (
        <div className="mt-12 flex items-center justify-center gap-10">
          <FrownIcon size={160} strokeWidth={1.5} className="shrink-0 text-black" />
          <div>
            <h2 className="text-[28px] font-bold text-black">No Buying Periods</h2>
            <p className="mt-2 text-[18px] text-neutral-700">
              There are currently no buying periods defined.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 cursor-pointer rounded border border-black bg-[#5cb3e0] px-5 py-2.5 text-[16px] font-medium text-white transition-colors hover:bg-[#4aa8d8]"
            >
              Create Buying Period
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-[28px] font-bold text-black">Product Buying Periods</h1>
            <button
              type="button"
              onClick={openCreate}
              className="cursor-pointer rounded border border-black bg-[#5cb3e0] px-5 py-2.5 text-[14px] font-medium text-white hover:bg-[#4aa8d8]"
            >
              Create Buying Period
            </button>
          </div>
          <ListTable
            columns={[
              { label: "Start" },
              { label: "End" },
              { label: "Quantity", align: "right" },
              { label: "Cost", align: "right" },
              { label: "Type" },
            ]}
            rows={items.map((row) => [
              formatDate(row.start),
              formatDate(row.end),
              row.quantity ?? "—",
              row.cost != null ? `$${Number(row.cost).toFixed(2)}` : "—",
              row.itemType ?? "—",
            ])}
          />
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      )}

      <CreateBuyingPeriodModal
        open={creating}
        initial={initial}
        onClose={() => {
          clearInitial();
          setCreating(false);
        }}
        onCreated={reload}
      />
    </div>
  );
}
