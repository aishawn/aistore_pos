"use client";

export type ReceiptDateType = "USE_BY" | "BEST_BEFORE";
export type ReceiptBatchDraft = { id: string; code: string; expiryDate: string; quantity: string; dateType?: ReceiptDateType };

export function receiptDateTypeLabel(dateType?: ReceiptDateType | null) {
  return dateType === "USE_BY" ? "Use by" : dateType === "BEST_BEFORE" ? "Best before" : "Date type unrecorded";
}

export function ReceiptBatchEditor({ batches, disabled, onChange }: {
  batches: ReceiptBatchDraft[];
  disabled: boolean;
  onChange: (batches: ReceiptBatchDraft[]) => void;
}) {
  return (
    <>
      {batches.map((batch, index) => (
        <fieldset key={batch.id} disabled={disabled} className="grid gap-2 rounded-md bg-[var(--oh-surface)] p-2 sm:grid-cols-2">
          <legend className="px-1 text-xs font-semibold">Batch {index + 1}</legend>
          {(["code", "expiryDate", "quantity"] as const).map((field) => (
            <label key={field} className="min-w-0 text-xs">
              {{ code: "Batch code", expiryDate: "Date on label", quantity: "Received quantity" }[field]}
              <input
                type={{ code: "text", expiryDate: "date", quantity: "number" }[field]}
                maxLength={field === "code" ? 120 : undefined}
                step={field === "quantity" ? "0.0001" : undefined}
                className="mt-1 h-10 w-full rounded-md border border-[var(--oh-border)] px-2 text-sm"
                value={batch[field]}
                onChange={(event) => {
                  onChange(batches.map((entry) => entry.id === batch.id
                    ? { ...entry, [field]: event.target.value } : entry));
                }}
              />
            </label>
          ))}
          <label className="min-w-0 text-xs">
            Date type
            <select
              className="mt-1 h-10 w-full rounded-md border border-[var(--oh-border)] px-2 text-sm"
              value={batch.dateType ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const dateType = value === "USE_BY" || value === "BEST_BEFORE" ? value : undefined;
                onChange(batches.map((entry) => entry.id === batch.id ? { ...entry, dateType } : entry));
              }}
            >
              <option value="">Unrecorded</option>
              <option value="USE_BY">Use by</option>
              <option value="BEST_BEFORE">Best before</option>
            </select>
          </label>
          <button type="button" onClick={() => {
            onChange(batches.filter((entry) => entry.id !== batch.id));
          }} className="justify-self-start px-1 py-2 text-xs font-semibold">Remove batch</button>
        </fieldset>
      ))}
      <button type="button" disabled={disabled} onClick={() => {
        onChange([...batches, { id: crypto.randomUUID(), code: "", expiryDate: "", quantity: "" }]);
      }} className="px-1 py-2 text-xs font-semibold text-[var(--oh-primary)]">Add batch and expiry</button>
    </>
  );
}

export function receiptBatchPayload(batches: ReceiptBatchDraft[], quantity: number) {
  const entries = batches.map(({ code, expiryDate, quantity, dateType }) => ({ code: code.trim(), expiryDate, quantity: Number(quantity), dateType }));
  if (entries.length && (
    !Number.isFinite(quantity)
    || entries.some((batch) => !batch.code || !batch.expiryDate || !Number.isFinite(batch.quantity) || batch.quantity <= 0)
    || new Set(entries.map((batch) => batch.code)).size !== entries.length
    || Math.abs(entries.reduce((total, batch) => total + batch.quantity, 0) - quantity) > 1e-8
  )) {
    throw new Error("Enter unique batch codes and expiry dates. Batch quantities must add up to the received quantity.");
  }
  return entries;
}
