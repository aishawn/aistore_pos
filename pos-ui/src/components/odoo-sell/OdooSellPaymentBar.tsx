"use client";

import type { Ref } from "react";
import { AdminNavyButton, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { cn } from "@/lib/utils";
import { money } from "./shared";

type PaymentMethodLike = { id: number; name: string };

type OdooSellPaymentBarProps = {
  linesLength: number;
  eftposSelected: boolean;
  cashSelected: boolean;
  cardMethod: PaymentMethodLike | null;
  cashMethod: PaymentMethodLike | null;
  selectedPayment: PaymentMethodLike | null;
  hasConfig: boolean;
  busy: boolean;
  isCashPayment: boolean;
  paymentMethodId: number | null;
  amountToCollect: number;
  cashTendered: string;
  tenderedAmount: number;
  changeDue: number;
  confirmedMatches: boolean;
  quoteIsCurrent: boolean;
  totalWhole: string;
  totalCents: string;
  awaitingCardConfirm: boolean;
  paymentConfirmRef: Ref<HTMLButtonElement>;
  onSelectCard: () => void;
  onSelectCash: () => void;
  onCashOut: () => void;
  onClear: () => void;
  onCashTenderedChange: (value: string) => void;
  onToggleTerminalConfirm: () => void;
};

export function OdooSellPaymentBar({
  linesLength,
  eftposSelected,
  cashSelected,
  cardMethod,
  cashMethod,
  selectedPayment,
  hasConfig,
  busy,
  isCashPayment,
  paymentMethodId,
  amountToCollect,
  cashTendered,
  tenderedAmount,
  changeDue,
  confirmedMatches,
  quoteIsCurrent,
  totalWhole,
  totalCents,
  awaitingCardConfirm,
  paymentConfirmRef,
  onSelectCard,
  onSelectCash,
  onCashOut,
  onClear,
  onCashTenderedChange,
  onToggleTerminalConfirm,
}: OdooSellPaymentBarProps) {
  return (
    <div className="order-1 shrink-0 lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-1">
      <div className="flex flex-wrap items-center gap-2">
        {eftposSelected ? (
          <AdminNavyButton className="min-h-11 ring-2 ring-[var(--oh-primary)] ring-offset-1" onClick={onSelectCard} disabled={!cardMethod}>
            EFTPOS
          </AdminNavyButton>
        ) : (
          <AdminSecondaryButton
            className={cn("min-h-11", !cardMethod && "opacity-45")}
            onClick={onSelectCard}
            disabled={!cardMethod}
            title={!cardMethod ? "No card payment method on this register" : cardMethod.name}
          >
            EFTPOS
          </AdminSecondaryButton>
        )}
        {cashSelected ? (
          <AdminNavyButton className="min-h-11 ring-2 ring-[var(--oh-primary)] ring-offset-1" onClick={onSelectCash} disabled={!cashMethod}>
            Exact Cash
          </AdminNavyButton>
        ) : (
          <AdminSecondaryButton
            className={cn("min-h-11", !cashMethod && "opacity-45")}
            onClick={onSelectCash}
            disabled={!cashMethod}
            title={!cashMethod ? "No cash payment method on this register" : "Select cash, prefill amount due — edit to give change"}
          >
            Exact Cash
          </AdminSecondaryButton>
        )}
        <AdminSecondaryButton
          className={cn("min-h-11", (!hasConfig || busy) && "opacity-45")}
          onClick={onCashOut}
          disabled={!hasConfig || busy}
          title={!hasConfig ? "Open a register session before recording cash out" : "Record cash taken from the register"}
        >
          Cash Out
        </AdminSecondaryButton>
        <AdminSecondaryButton
          className={cn(
            "min-h-11",
            !linesLength && "opacity-45",
            linesLength > 0 && "border-[var(--oh-tile-red-border)] text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)]",
          )}
          onClick={onClear}
          disabled={!linesLength}
          title={linesLength ? "Clear the current cart" : "Cart is already empty"}
        >
          Clear Sale
        </AdminSecondaryButton>
        <div className="ml-auto flex flex-wrap items-center gap-3 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-1.5 shadow-sm">
          <span className={cn("text-[22px] font-bold leading-none tabular-nums", linesLength ? "text-[var(--oh-text)]" : "text-[var(--oh-border-strong)]")}>
            ${totalWhole}
            <span className="text-[14px]">.{totalCents}</span>
          </span>
          <span className="text-[12px] font-medium text-[var(--oh-muted)]">
            Finalise from cart
          </span>
        </div>
      </div>
      {(isCashPayment || (!isCashPayment && paymentMethodId)) && linesLength > 0 && (
        <div
          className={cn(
            "mt-2 flex flex-wrap items-end gap-3 rounded-lg border bg-[var(--oh-surface-elevated)] px-3 py-2",
            awaitingCardConfirm ? "border-amber-300 ring-1 ring-amber-200" : "border-[var(--oh-border)]",
          )}
        >
          {isCashPayment && (
            <label className="grid min-w-[160px] flex-1 gap-1 text-[13px] font-medium text-[var(--oh-text-secondary)]">
              Cash received
              <input
                type="number"
                inputMode="decimal"
                min={amountToCollect}
                max={1_000_000}
                step="0.01"
                id="cash-tendered"
                value={cashTendered}
                onChange={(event) => onCashTenderedChange(event.target.value)}
                placeholder={amountToCollect.toFixed(2)}
                className="h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2 text-sm font-semibold tabular-nums outline-none focus:border-[var(--oh-primary)]"
              />
              <span className="text-[12px] font-normal text-[var(--oh-muted)]">Edit amount to give change</span>
              {Number.isFinite(tenderedAmount) && tenderedAmount + 0.001 >= amountToCollect && (
                <span className="text-[14px] font-semibold tabular-nums text-[var(--oh-text)]">Change {money(changeDue)}</span>
              )}
            </label>
          )}
          {!isCashPayment && paymentMethodId && (
            <div className="flex min-w-[280px] flex-1 flex-col gap-1.5">
              <button
                ref={paymentConfirmRef}
                id="odoo-payment-terminal-confirm"
                type="button"
                role="switch"
                aria-label="Payment approved on the external terminal"
                aria-checked={confirmedMatches}
                disabled={busy || !quoteIsCurrent}
                onClick={onToggleTerminalConfirm}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  confirmedMatches
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors",
                    confirmedMatches ? "bg-emerald-600" : "bg-amber-500",
                  )}
                >
                  <span className={cn("h-6 w-6 rounded-full bg-[var(--oh-surface-elevated)] shadow transition-transform", confirmedMatches && "translate-x-5")} />
                </span>
                <span>
                  <span className="block font-semibold">
                    {confirmedMatches ? "Terminal approved — ready to finalise" : "Waiting for terminal approval"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 opacity-90">
                    {confirmedMatches
                      ? "Use Finalise Sale in the cart to record this payment in Orithos."
                      : "After the customer pays, confirm the terminal result here. Orithos records only — it does not charge the card."}
                  </span>
                </span>
              </button>
            </div>
          )}
          {selectedPayment && <p className="text-[13px] text-[var(--oh-muted)]">Paying with {selectedPayment.name}</p>}
        </div>
      )}
    </div>
  );
}
