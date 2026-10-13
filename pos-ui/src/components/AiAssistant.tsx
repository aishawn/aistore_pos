"use client";

import { useState } from "react";
import { X, Mic } from "lucide-react";
import { useSellScreen } from "@/lib/sell-screen";

const QUICK_ACTIONS = [
  {
    category: "Item Functions",
    actions: ["Price Check", "Apply Discount", "Void Item", "Split Bill"],
  },
  {
    category: "Retail Tools",
    actions: ["Apply Loyalty", "Redeem Points", "Suspend Transaction", "Gift Card"],
  },
  {
    category: "Restricted Goods",
    actions: ["ID Check", "Age Verified", "Report Lic. Issue", "WET Tax Report"],
  },
  {
    category: "Admin Functions",
    actions: ["Inventory Search", "Create Customer", "Reprint Last", "Manager Override"],
  },
];

const DEMO_MESSAGES = [
  {
    role: "assistant" as const,
    text: "Hello! I'm your Orithos AI assistant. I can help with this sale transaction.",
  },
  { role: "user" as const, text: "Is age verification required for this sale?" },
  {
    role: "assistant" as const,
    text: "Yes — this transaction contains restricted liquor items. Please verify customer ID before finalising.",
  },
];

/** Floating Orithos AI Conversational Assistant — matches reference overlay. */
export function AiAssistant() {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState("");
  const sell = useSellScreen();

  function runAction(action: string) {
    if (action === "Void Item" && sell.selectedId) {
      sell.removeLine(sell.selectedId);
      return;
    }
    if (action === "Create Customer") {
      sell.setView("customers");
      return;
    }
    sell.runAction(action);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[var(--oh-primary)] text-white shadow-lg hover:bg-[var(--oh-primary-hover)]"
        aria-label="Open AI assistant"
      >
        <Mic size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-30 flex w-[300px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-2xl">
      {/* Dark navy header */}
      <div className="flex items-center justify-between bg-[var(--oh-primary)] px-4 py-3">
        <span className="text-[13px] font-semibold text-white">Orithos AI Conversational Assistant</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded p-0.5 text-white/70 hover:text-white"
          aria-label="Close assistant"
        >
          <X size={15} />
        </button>
      </div>

      {/* Chat */}
      <div className="max-h-[160px] min-h-[120px] overflow-y-auto bg-[var(--oh-surface)] p-3">
        {DEMO_MESSAGES.map((msg, i) => (
          <div
            key={i}
            className={`mb-2 max-w-[90%] rounded-[var(--oh-radius)] px-3 py-2 text-[13px] leading-relaxed ${
              msg.role === "user"
                ? "ml-auto bg-[var(--oh-navy)] text-white"
                : "mr-auto bg-white text-[var(--oh-text-secondary)] shadow-sm"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {/* Pill action grid */}
      <div className="max-h-[210px] overflow-y-auto border-t border-[var(--oh-border)] p-3">
        {QUICK_ACTIONS.map((group) => (
          <div key={group.category} className="mb-2.5">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--oh-muted)]">
              {group.category}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => runAction(action)}
                  className="cursor-pointer rounded-full border border-[var(--oh-border-strong)] bg-white px-2.5 py-1 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[var(--oh-border)] p-2.5">
        <button
          type="button"
          aria-label="Voice input"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--oh-border)] text-[var(--oh-muted)] hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
        >
          <Mic size={14} />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Orithos AI…"
          className="h-8 min-w-0 flex-1 rounded-full border border-[var(--oh-border)] px-3 text-[13px] outline-none focus:border-[var(--oh-orange)]"
        />
      </div>
    </div>
  );
}
