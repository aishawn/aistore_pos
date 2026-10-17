"use client";

import { useEffect, useRef, useState } from "react";
import { useSellScreen, splitMoney, isEftposCashOut, isExactCash, toCheckoutItem } from "@/lib/sell-screen";
import { GstSummary } from "@/components/GstSummary";
import { roundCashToFiveCents } from "@/lib/au";
import { checkoutSale, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/**
 * Centre-screen dialogs for the Sell pad: cancel sale, payment flow, and
 * generic action notices.
 */
export function SellModals() {
  const {
    confirmClearOpen,
    confirmClear,
    cancelClear,
    pendingAction,
    actionMessage,
    dismissAction,
    payment,
    noteDialogOpen,
    closeNoteDialog,
    saveSaleNote,
    saleNote,
    discountDialogOpen,
    closeDiscountDialog,
    applyLineDiscount,
    clearLineDiscount,
    selectedId,
    lines,
    pendingResumeId,
    confirmResumeParked,
    cancelResumeParked,
    cancelPayment,
  } = useSellScreen();

  const dismissible = Boolean(confirmClearOpen || pendingResumeId || noteDialogOpen || discountDialogOpen || pendingAction || payment);
  const dialogKey = confirmClearOpen
    ? "clear"
    : pendingResumeId
      ? "resume"
      : noteDialogOpen
        ? "note"
        : discountDialogOpen
          ? "discount"
          : payment
            ? "payment"
            : pendingAction
              ? "action"
              : "closed";
  useDialogFocus(dismissible, () => {
    if (confirmClearOpen) cancelClear();
    else if (pendingResumeId) cancelResumeParked();
    else if (noteDialogOpen) closeNoteDialog();
    else if (discountDialogOpen) closeDiscountDialog();
    else if (payment && payment.phase !== "processing") cancelPayment();
    else if (pendingAction) dismissAction();
  }, dialogKey);

  if (
    !confirmClearOpen &&
    !pendingAction &&
    !payment &&
    !noteDialogOpen &&
    !discountDialogOpen &&
    !pendingResumeId
  ) {
    return null;
  }

  const discountLine = selectedId
    ? lines.find((l) => l.id === selectedId)
    : lines[lines.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 font-sans">
      {confirmClearOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
          <h3 id="cancel-sale-title" className="mb-3 text-[18px] font-semibold text-[var(--oh-text)]">Cancel Sale</h3>
          <p className="mb-6 text-[14px] text-[var(--oh-text-secondary)]">
            Are you sure you would like to cancel this sale?
          </p>
          <div className="flex justify-end gap-3">
            <ModalBtn variant="secondary" onClick={cancelClear}>
              No
            </ModalBtn>
            <ModalBtn variant="primary" onClick={confirmClear}>
              Yes
            </ModalBtn>
          </div>
        </div>
      )}

      {!confirmClearOpen && pendingResumeId && (
        <div role="dialog" aria-modal="true" aria-labelledby="resume-parked-sale-title" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
          <h3 id="resume-parked-sale-title" className="mb-3 text-[18px] font-semibold text-[var(--oh-text)]">Resume Parked Sale</h3>
          <p className="mb-6 text-[14px] text-[var(--oh-text-secondary)]">
            The current cart has items. Resuming will replace them with the parked sale.
          </p>
          <div className="flex justify-end gap-3">
            <ModalBtn variant="secondary" onClick={cancelResumeParked}>
              Cancel
            </ModalBtn>
            <ModalBtn variant="primary" onClick={confirmResumeParked}>
              Resume
            </ModalBtn>
          </div>
        </div>
      )}

      {!confirmClearOpen && !pendingResumeId && noteDialogOpen && (
        <NoteDialog
          initial={saleNote}
          onCancel={closeNoteDialog}
          onSave={saveSaleNote}
        />
      )}

      {!confirmClearOpen && !pendingResumeId && !noteDialogOpen && discountDialogOpen && discountLine && (
        <DiscountDialog
          line={discountLine}
          onCancel={closeDiscountDialog}
          onApply={applyLineDiscount}
          onClear={clearLineDiscount}
        />
      )}

      {!confirmClearOpen && !pendingResumeId && !noteDialogOpen && !discountDialogOpen && payment && <PaymentDialog />}

      {!confirmClearOpen &&
        !pendingResumeId &&
        !noteDialogOpen &&
        !discountDialogOpen &&
        !payment &&
        pendingAction && (
          <div role="dialog" aria-modal="true" aria-labelledby="sell-action-title" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
            <h3 id="sell-action-title" className="mb-3 text-[18px] font-semibold text-[var(--oh-text)]">{pendingAction}</h3>
            <p className="mb-6 whitespace-pre-line text-[14px] text-[var(--oh-text-secondary)]">
              {actionMessage ?? `"${pendingAction}" completed.`}
            </p>
            <div className="flex justify-end">
              <ModalBtn variant="primary" onClick={dismissAction}>
                OK
              </ModalBtn>
            </div>
          </div>
        )}
    </div>
  );
}

function NoteDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div role="dialog" aria-modal="true" aria-label="Add sale note" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
      <h3 className="mb-3 text-[18px] font-semibold text-[var(--oh-text)]">Add Note</h3>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        placeholder="Note for this sale…"
        className="mb-6 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-3 py-2 text-[14px] outline-none focus:border-[var(--oh-orange)]"
        autoFocus
      />
      <div className="flex justify-end gap-3">
        <ModalBtn variant="secondary" onClick={onCancel}>
          Cancel
        </ModalBtn>
        <ModalBtn variant="primary" onClick={() => onSave(value)}>
          Save
        </ModalBtn>
      </div>
    </div>
  );
}

function ModalBtn({
  children,
  onClick,
  variant = "secondary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 cursor-pointer rounded-[var(--oh-radius)] px-5 py-2 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
        variant === "primary"
          ? "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"
          : "border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
      )}
    >
      {children}
    </button>
  );
}

function DiscountDialog({
  line,
  onCancel,
  onApply,
  onClear,
}: {
  line: { name: string; qty: number; unitPrice: number; discount?: number; discountReason?: string };
  onCancel: () => void;
  onApply: (params: { amount?: number; percent?: number; reason?: string }) => void;
  onClear: () => void;
}) {
  const lineSubtotal = line.qty * line.unitPrice;
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [value, setValue] = useState(
    line.discount != null && line.discount > 0
      ? String(line.discount)
      : "",
  );
  const [reason, setReason] = useState(line.discountReason ?? "");

  const parsed = parseFloat(value);
  const previewDiscount =
    mode === "percent" && Number.isFinite(parsed) && parsed > 0
      ? Math.round(lineSubtotal * (parsed / 100) * 100) / 100
      : Number.isFinite(parsed) && parsed > 0
        ? Math.min(lineSubtotal, Math.round(parsed * 100) / 100)
        : 0;

  function save() {
    if (mode === "percent") {
      onApply({ percent: parsed, reason });
    } else {
      onApply({ amount: parsed, reason });
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Apply discount" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
      <h3 className="mb-1 text-[18px] font-semibold text-[var(--oh-text)]">Discount</h3>
      <p className="mb-4 truncate text-[13px] text-[var(--oh-muted)]">
        {line.name} · ${lineSubtotal.toFixed(2)} line total
      </p>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={cn(
            "flex-1 cursor-pointer rounded-[var(--oh-radius)] border px-3 py-2 text-[13px] font-medium transition-colors",
            mode === "amount"
              ? "border-[var(--oh-orange)] bg-[var(--oh-orange-light)] text-[var(--oh-orange)]"
              : "border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
          )}
        >
          Dollar ($)
        </button>
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={cn(
            "flex-1 cursor-pointer rounded-[var(--oh-radius)] border px-3 py-2 text-[13px] font-medium transition-colors",
            mode === "percent"
              ? "border-[var(--oh-orange)] bg-[var(--oh-orange-light)] text-[var(--oh-orange)]"
              : "border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
          )}
        >
          Percent (%)
        </button>
      </div>

      <label className="mb-1 block text-[13px] font-medium text-[var(--oh-muted)]">
        {mode === "amount" ? "Discount amount" : "Discount percent"}
      </label>
      <input
        type="number"
        min={0}
        step={mode === "amount" ? "0.01" : "1"}
        max={mode === "percent" ? 100 : lineSubtotal}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === "amount" ? "0.00" : "0"}
        className="mb-3 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-3 py-2 text-[14px] outline-none focus:border-[var(--oh-orange)]"
        autoFocus
      />

      <label className="mb-1 block text-[13px] font-medium text-[var(--oh-muted)]">
        Reason (optional)
      </label>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Staff discount, price match…"
        className="mb-4 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-3 py-2 text-[14px] outline-none focus:border-[var(--oh-orange)]"
      />

      {previewDiscount > 0 && (
        <p className="mb-4 text-[13px] text-[var(--oh-text-secondary)]">
          New line total: <span className="font-semibold">${(lineSubtotal - previewDiscount).toFixed(2)}</span>
          {" "}(−${previewDiscount.toFixed(2)})
        </p>
      )}

      <div className="flex justify-between gap-3">
        {line.discount != null && line.discount > 0 ? (
          <ModalBtn
            variant="secondary"
            onClick={() => {
              onClear();
              onCancel();
            }}
          >
            Remove Discount
          </ModalBtn>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
          <ModalBtn variant="secondary" onClick={onCancel}>
            Cancel
          </ModalBtn>
          <ModalBtn variant="primary" onClick={save}>
            Apply
          </ModalBtn>
        </div>
      </div>
    </div>
  );
}

/** Format a dollar amount with a leading "$" and two decimals. */
function money(value: number): string {
  const { whole, cents } = splitMoney(value);
  return `$${whole}.${cents}`;
}

function parseCashAmount(input: string): number {
  const n = parseFloat(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

const CASHOUT_PRESETS = [20, 50, 100] as const;

function CashOutEntryDialog({
  amountDue,
  onCancel,
  onConfirm,
}: {
  amountDue: number;
  onCancel: () => void;
  onConfirm: (cashout: number) => void;
}) {
  const [input, setInput] = useState("0");
  const cashout = parseCashAmount(input);
  const cardTotal = Math.round((amountDue + cashout) * 100) / 100;

  function appendDigit(digit: string) {
    setInput((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : `${prev}.`;
      }
      if (prev === "0" && digit !== ".") return digit;
      return prev + digit;
    });
  }

  function backspace() {
    setInput((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"] as const;

  return (
    <div role="dialog" aria-modal="true" aria-label="Eftpos cash out" className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
      <h3 className="mb-1 text-[18px] font-semibold text-[var(--oh-text)]">Eftpos Cash Out</h3>
      <p className="mb-5 text-[13px] text-[var(--oh-muted)]">
        Enter the cash amount to give the customer from the till.
      </p>

      <div className="mb-4 space-y-2 rounded-[var(--oh-radius)] bg-[var(--oh-surface)] p-4 text-[14px]">
        <div className="flex justify-between text-[var(--oh-text-secondary)]">
          <span>Purchase</span>
          <span>{money(amountDue)}</span>
        </div>
        <div className="flex justify-between text-[var(--oh-text-secondary)]">
          <span>Cash Out</span>
          <span className="font-semibold text-[var(--oh-text)]">{money(cashout)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--oh-border)] pt-2 font-bold text-[var(--oh-text)]">
          <span>Card Total</span>
          <span>{money(cardTotal)}</span>
        </div>
      </div>

      <div className="mb-3 text-center text-[32px] font-bold leading-none text-[var(--oh-text)]">
        {money(cashout)}
      </div>

      <div className="mb-3 flex justify-center gap-2">
        {CASHOUT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setInput(String(preset))}
            className="cursor-pointer rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-3 py-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)] hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
          >
            ${preset}
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => (key === "backspace" ? backspace() : appendDigit(key))}
            className="cursor-pointer rounded-[var(--oh-radius)] border border-[var(--oh-border)] py-3 text-[18px] font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
          >
            {key === "backspace" ? "⌫" : key}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <ModalBtn variant="secondary" onClick={onCancel}>
          Cancel
        </ModalBtn>
        <ModalBtn variant="primary" onClick={() => onConfirm(cashout)}>
          Process Payment
        </ModalBtn>
      </div>
    </div>
  );
}

/**
 * The tender flow. Submitting a tender calls the backend checkout endpoint,
 * which computes the change and persists a completed sale; the dialog then
 * shows the backend's result. Completing clears the pad for the next customer.
 */
function PaymentDialog() {
  const {
    payment,
    lines,
    total,
    gstTotal,
    pricesIncludeGst,
    setPricesIncludeGst,
    customer,
    confirmCashOut,
    settlePayment,
    failPayment,
    retryPayment,
    completeSale,
    cancelPayment,
  } = useSellScreen();

  const inFlight = useRef(false);

  useEffect(() => {
    if (payment?.phase !== "processing" || inFlight.current) return;
    inFlight.current = true;
    let cancelled = false;

    const eftposCashOut = isEftposCashOut(payment.method);
    const exactCash = isExactCash(payment.method);
    const cashout = eftposCashOut ? payment.cashout : undefined;

    checkoutSale({
      tender: payment.method,
      customerId: customer?.id ?? null,
      tendered: exactCash
        ? payment.amountDue
        : eftposCashOut
          ? payment.amountDue + (payment.cashout ?? 0)
          : undefined,
      cashout: eftposCashOut ? cashout : undefined,
      items: lines.map(toCheckoutItem),
    })
      .then((res) => {
        if (cancelled) return;
        settlePayment({
          tendered: res.tendered,
          change: res.change,
          cashout: res.cashout,
          invoiceId: res.invoiceId,
          paymentMethodName: res.paymentMethod,
          gst: res.gst,
          rounding: res.rounding,
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiError
            ? e.status === 401
              ? "You must be signed in to take a payment."
              : e.message
            : "Could not reach the payment service. Is the backend running?";
        failPayment(msg);
      })
      .finally(() => {
        inFlight.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    payment?.phase,
    payment?.method,
    payment?.amountDue,
    payment?.cashout,
    lines,
    customer,
    settlePayment,
    failPayment,
  ]);

  if (!payment) return null;

  if (payment.phase === "cashout-entry") {
    return (
      <CashOutEntryDialog
        amountDue={payment.amountDue}
        onCancel={cancelPayment}
        onConfirm={confirmCashOut}
      />
    );
  }

  const isCard = payment.kind === "card";
  const eftposCashOut = isEftposCashOut(payment.method);
  const exactCash = isExactCash(payment.method);
  const cashDue = roundCashToFiveCents(payment.amountDue);
  const cardCharged =
    eftposCashOut && payment.cashout > 0
      ? Math.round((payment.amountDue + payment.cashout) * 100) / 100
      : payment.tendered;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${payment.method} payment`} className="w-[420px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-6 shadow-xl">
      <h3 className="mb-1 text-[18px] font-semibold text-[var(--oh-text)]">{payment.method}</h3>
      <p className="mb-5 text-[13px] text-[var(--oh-muted)]">
        {exactCash
          ? "Exact cash — nearest 5 cents, no change"
          : eftposCashOut && payment.cashout > 0
            ? "Card payment with cash out"
            : isCard
              ? "Card payment"
              : "Cash payment"}
      </p>

      <div className="mb-4">
        <GstSummary
          total={total}
          gst={payment.gst ?? gstTotal}
          pricesIncludeGst={pricesIncludeGst}
          onTogglePrices={setPricesIncludeGst}
          showCash={!isCard && !eftposCashOut}
        />
      </div>

      <div className="mb-6 rounded-[var(--oh-radius)] bg-[var(--oh-surface)] p-5 text-center">
        <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          {exactCash ? "Cash Due" : eftposCashOut && payment.cashout > 0 ? "Purchase Amount" : "Amount Due"}
        </div>
        <div className="text-[36px] font-bold leading-tight text-[var(--oh-text)]">
          {money(exactCash ? cashDue : payment.amountDue)}
        </div>

        {exactCash && payment.phase !== "error" && (
          <div className="mt-3 space-y-1 text-[14px] text-[var(--oh-text-secondary)]">
            <div className="flex justify-between">
              <span>Cash Received</span>
              <span>{money(cashDue)}</span>
            </div>
            <div className="flex justify-between font-semibold text-[var(--oh-text)]">
              <span>Change</span>
              <span>{money(0)}</span>
            </div>
          </div>
        )}

        {payment.phase === "processing" && (
          <div className="mt-4 flex items-center justify-center gap-3 text-[14px] text-[var(--oh-text-secondary)]">
            <span
              aria-hidden
              className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--oh-border)] border-t-[var(--oh-orange)]"
            />
            {exactCash
              ? "Recording exact cash payment…"
              : eftposCashOut && payment.cashout > 0
                ? `Charge ${money(cardCharged)} on card — give ${money(payment.cashout)} cash…`
                : isCard
                  ? "Waiting for card — insert, swipe or tap…"
                  : "Counting cash…"}
          </div>
        )}

        {payment.phase === "approved" && (
          <div className="mt-4">
            <div className="text-[20px] font-bold uppercase text-[var(--oh-success)]">
              {exactCash ? "Paid" : "Approved"}
            </div>
            <div className="mt-3 space-y-1 text-[14px] text-[var(--oh-text-secondary)]">
              {exactCash && (
                <>
                  <div className="flex justify-between">
                    <span>Cash Received</span>
                    <span>{money(cashDue)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[var(--oh-text)]">
                    <span>Change</span>
                    <span>{money(0)}</span>
                  </div>
                  <p className="pt-2 text-[13px] font-medium text-[var(--oh-success)]">
                    Exact amount — no change due
                  </p>
                </>
              )}
              {eftposCashOut && payment.cashout > 0 && (
                <>
                  <div className="flex justify-between">
                    <span>Purchase</span>
                    <span>{money(payment.amountDue)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-[var(--oh-text)]">
                    <span>Cash Out</span>
                    <span>{money(payment.cashout)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[var(--oh-text)]">
                    <span>Card Charged</span>
                    <span>{money(cardCharged)}</span>
                  </div>
                  <p className="pt-2 text-[13px] font-medium text-[var(--oh-orange)]">
                    Give {money(payment.cashout)} cash to the customer
                  </p>
                </>
              )}
              {(!exactCash && (!eftposCashOut || payment.cashout <= 0)) && (
                <div className="flex justify-between">
                  <span>{isCard ? "Card" : "Cash"} Tendered</span>
                  <span>{money(payment.tendered)}</span>
                </div>
              )}
              {!exactCash && (
                <div className="flex justify-between font-bold text-[var(--oh-text)]">
                  <span>Change</span>
                  <span>{money(payment.change)}</span>
                </div>
              )}
              {payment.invoiceId && (
                <div className="flex justify-between pt-1 text-[13px] text-[var(--oh-muted)]">
                  <span>Invoice</span>
                  <span>{payment.invoiceId}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {payment.phase === "error" && (
          <div className="mt-4 text-[14px] text-[var(--oh-danger)]">
            {payment.error ?? "Payment failed."}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        {payment.phase === "processing" && (
          <ModalBtn variant="secondary" onClick={cancelPayment}>
            Cancel
          </ModalBtn>
        )}

        {payment.phase === "error" && (
          <>
            <ModalBtn variant="secondary" onClick={cancelPayment}>
              Cancel
            </ModalBtn>
            <ModalBtn variant="primary" onClick={retryPayment}>
              Retry
            </ModalBtn>
          </>
        )}

        {payment.phase === "approved" && (
          <ModalBtn variant="primary" onClick={completeSale}>
            Complete Sale
          </ModalBtn>
        )}
      </div>
    </div>
  );
}
