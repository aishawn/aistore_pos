"use client";

import { useEffect, useId, useRef, useState } from "react";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import {
  FormDateRangePicker,
  getDefaultStatementDateRange,
} from "@/components/admin/FormDateRangePicker";
import { useApi } from "@/hooks/useApi";
import { AsyncDependencyNotice } from "@/components/admin/AsyncState";
import { useDialogFocus } from "@/hooks/useDialogFocus";

interface Named {
  id: string;
  name: string;
}

export interface StatementViewParams {
  start: string;
  end: string;
  statementTemplateId: string;
  customerId?: string;
  name?: string;
  groupIds?: string;
}

export function buildStatementsPreviewPath(params: StatementViewParams) {
  const query = new URLSearchParams({
    start: params.start,
    end: params.end,
    templateId: params.statementTemplateId,
  });
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.name) query.set("name", params.name);
  if (params.groupIds) query.set("groupIds", params.groupIds);
  return `/customers/balances/statements?${query.toString()}`;
}

/** View-statements dialog with date range and template selection. */
export function ViewAllStatementsModal({
  open,
  onClose,
  onView,
  customerName,
}: {
  open: boolean;
  onClose: () => void;
  onView?: (params: StatementViewParams) => void;
  /** When set, preview is scoped to a single customer. */
  customerName?: string;
}) {
  const statements = useApi<Named[]>("/api/statements");
  const [range, setRange] = useState(getDefaultStatementDateRange);
  const [statementTemplateId, setStatementTemplateId] = useState("");
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setRange(getDefaultStatementDateRange());
    setStatementTemplateId("");
  }, [open]);

  useEffect(() => {
    if (!open || statementTemplateId || !statements.data?.length) return;
    const preferred = statements.data.find((s) => s.name === "Statement") ?? statements.data[0];
    setStatementTemplateId(preferred.id);
  }, [open, statements.data, statementTemplateId]);

  function close() {
    onClose();
  }

  useDialogFocus(open, close, "view-statements", cancelRef);

  if (!open) return null;

  function submit() {
    if (!range.start || !range.end) return;
    onView?.({ ...range, statementTemplateId });
    onClose();
  }

  const templateOptions = (statements.data ?? []).map((s) => ({ label: s.name, value: s.id }));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[420px] rounded-lg bg-white px-8 pb-8 pt-14 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute left-1/2 top-0 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#5cb3e0]">
          <QuestionIcon size={36} className="text-white" strokeWidth={1.5} />
        </div>

        <h2 id={titleId} className="text-center text-[22px] font-bold text-black">View Statement</h2>
        {customerName && (
          <p className="mt-2 text-center text-[15px] text-neutral-600">{customerName}</p>
        )}

        <label className="mt-6 block text-[15px] text-black">
          Date Range
          <div className="mt-1">
            <FormDateRangePicker start={range.start} end={range.end} onChange={setRange} />
          </div>
        </label>

        <label className="mt-4 block text-[15px] text-black">
          Statement Template
          <ClassificationFormSelect
            value={statementTemplateId}
            options={templateOptions}
            onChange={setStatementTemplateId}
            loading={statements.loading}
            placeholder="Select…"
          />
        </label>

        <AsyncDependencyNotice
          dependencies={[{ label: "Statement templates", error: statements.error, onRetry: statements.reload }]}
        />

        <div className="mt-6 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            className="flex-1 rounded border border-neutral-300 bg-white py-2.5 text-[15px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!range.start || !range.end || !statementTemplateId || statements.loading || Boolean(statements.error)}
            className="flex-1 rounded bg-[#5cb3e0] py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#4aa3d0] disabled:opacity-60"
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}
