"use client";

import { useState } from "react";
import { cancelAiCommand, confirmAiCommand, type AiCommandResponse } from "@/lib/api";

export function AiCommandPreviewCard({
  command,
  onChange,
}: {
  command: AiCommandResponse;
  onChange: (next: AiCommandResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPreview = command.status === "PREVIEWED";
  const chinese = /[\u3400-\u9fff]/.test(command.summary + command.type);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onChange(await confirmAiCommand(command.commandId, chinese ? "确认修改" : "confirm", "TEXT", command.version));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply this change.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      onChange(await cancelAiCommand(command.commandId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel this preview.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={chinese ? "AI 修改预览" : "AI change preview"} className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="text-[13px]">{chinese ? "修改预览" : "Change preview"}</strong>
          <p className="mt-1 text-[13px] text-[var(--oh-text-secondary)]">{command.summary}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{command.status}</span>
      </div>
      {command.items.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-[var(--oh-border)]"><th className="px-1 py-1">{chinese ? "对象" : "Item"}</th><th className="px-1 py-1">{chinese ? "原值" : "Before"}</th><th className="px-1 py-1">{chinese ? "新值" : "After"}</th></tr></thead>
            <tbody>{command.items.slice(0, 50).map((item) => (
              <tr key={String(item.id) + "-" + item.field} className="border-b border-[var(--oh-border)] last:border-0">
                <td className="px-1 py-1">{item.name}</td><td className="px-1 py-1">{String(item.before ?? "")}</td><td className="px-1 py-1 font-medium">{String(item.after ?? "")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      {command.excludedItems.length > 0 ? <p className="mt-2 text-[12px] text-amber-700">{chinese ? "已排除：" : "Excluded: "}{command.excludedItems.map((item) => item.reason).filter(Boolean).join("; ")}</p> : null}
      {error ? <p role="alert" className="mt-2 text-[12px] text-rose-700">{error}</p> : null}
      {isPreview ? (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void confirm()} className="min-h-9 rounded-md bg-[var(--oh-primary)] px-3 text-[12px] font-semibold text-white disabled:opacity-50">{chinese ? "确认执行" : "Confirm"}</button>
          <button type="button" disabled={busy} onClick={() => void cancel()} className="min-h-9 rounded-md border border-[var(--oh-border)] px-3 text-[12px] font-semibold disabled:opacity-50">{chinese ? "取消" : "Cancel"}</button>
        </div>
      ) : null}
    </section>
  );
}
