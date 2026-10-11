"use client";

import { useEffect, useState } from "react";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import { exportCustomersCsv, type CustomerExportLevel } from "@/lib/api";

const LEVEL_OPTIONS = [
  { label: "Simple", value: "simple" },
  { label: "Full", value: "full" },
];

const SIMPLE_FIELDS = [
  "Name",
  "Company",
  "Code",
  "Birthday",
  "Email Addresses",
  "Phone Number",
  "Subscribed to Marketing Emails",
];

/** Export-customers dialog with detail level selection. */
export function ExportCustomersModal({
  open,
  onClose,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  filters?: {
    name?: string;
    groupIds?: string[];
  };
}) {
  const [level, setLevel] = useState<CustomerExportLevel>("simple");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLevel("simple");
    setError(null);
  }, [open]);

  if (!open) return null;

  function close() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await exportCustomersCsv({
        level,
        name: filters?.name || undefined,
        groupIds:
          filters?.groupIds && filters.groupIds.length > 0
            ? filters.groupIds.join(",")
            : undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={close}
    >
      <div
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">Export Customers</h2>
        </div>

        <div className="px-5 py-5">
          <p className="text-[14px] text-[var(--oh-text)]">What level of detail would you like to export?</p>

          <label className="mt-3 block text-[14px] font-medium text-[var(--oh-text)]">
            <ClassificationFormSelect
              value={level}
              options={LEVEL_OPTIONS}
              onChange={(v) => setLevel(v as CustomerExportLevel)}
            />
          </label>

          {error && <p className="mt-3 text-[13px] text-[var(--oh-danger)]">{error}</p>}

          <div className="mt-4 space-y-3 text-[14px] text-[var(--oh-text)]">
            <div>
              <p className="font-semibold">Simple:</p>
              <ul className="mt-1 list-disc pl-5 leading-relaxed">
                {SIMPLE_FIELDS.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold">Full:</p>
              <ul className="mt-1 list-disc pl-5">
                <li>All Customer Details</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#d8d8d8] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#ccc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4] disabled:opacity-60"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
