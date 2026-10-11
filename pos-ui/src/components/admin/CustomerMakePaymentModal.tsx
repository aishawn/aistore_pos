"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { Modal } from "@/components/admin/Modal";

interface PaymentMethod {
  id: string;
  name: string;
}

export function CustomerMakePaymentModal({
  customerId,
  customerName,
  currentOwing,
  onClose,
  onPaid,
}: {
  customerId: string;
  customerName: string;
  currentOwing: number;
  onClose: () => void;
  onPaid: () => void;
}) {
  const methods = useApi<PaymentMethod[]>("/api/payment-methods");
  const defaultAmount = currentOwing > 0 ? currentOwing.toFixed(2) : "";
  const [amount, setAmount] = useState(defaultAmount);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/customer-payments", {
        customerId,
        amount: parsed,
        paymentMethodId: paymentMethodId ? Number(paymentMethodId) : null,
        reference: reference.trim() || null,
      });
      onPaid();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Make Payment"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-5 py-2 text-[15px] text-neutral-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-md bg-[var(--oh-success)] px-5 py-2 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Processing…" : "Record Payment"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[14px] text-[var(--oh-text-secondary)]">
          Recording payment for <span className="font-semibold text-[var(--oh-text)]">{customerName}</span>
        </p>

        <label className="flex flex-col text-[14px] text-neutral-700">
          Amount
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-[44px] w-full rounded-md border border-neutral-300 pl-7 pr-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </div>
        </label>

        <label className="flex flex-col text-[14px] text-neutral-700">
          Payment Method
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="mt-1 h-[44px] rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
          >
            <option value="">Select method…</option>
            {(methods.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col text-[14px] text-neutral-700">
          Reference
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cheque number, transfer ref, etc."
            className="mt-1 h-[44px] rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
          />
        </label>

        {error && <p className="text-[13px] text-[var(--oh-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
