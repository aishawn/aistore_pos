"use client";



import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { DeleteIcon, PlusIcon, XIcon } from "@/components/icons";

import { AdminSecondaryButton } from "@/components/admin/AdminPageLayout";

import { cn } from "@/lib/utils";

import { GstSummary } from "@/components/GstSummary";

import { roundCashToFiveCents } from "@/lib/au";

import { splitMoney, useSellScreen, type Customer, lineNetTotal, toCheckoutItem } from "@/lib/sell-screen";

import { checkoutSale, ApiError } from "@/lib/api";



const PAYMENT_METHODS = [

  { id: "cash", label: "Cash", tender: "Exact Cash" },

  { id: "cheque", label: "Cheque", tender: "Cheque" },

  { id: "direct-deposit", label: "Direct Deposit", tender: "Direct Deposit" },

  { id: "eftpos", label: "EFTPOS", tender: "EFTPOS VISA MasterCard" },

  { id: "eftpos-no-cashout", label: "EFTPOS NO CASHOUT", tender: "EFTPOS NO CASHOUT" },

] as const;



type CheckoutPhase = "idle" | "processing" | "approved" | "error";

/** Seconds the approved receipt stays visible before the sale auto-completes. */
const AUTO_COMPLETE_SECONDS = 3;



type AppliedPayment = {

  method: string;

  amount: number;

};



function parseTender(input: string): number {

  const n = parseFloat(input);

  if (!Number.isFinite(n) || n < 0) return 0;

  return Math.round(n * 100) / 100;

}



function formatDisplay(input: string): string {

  if (!input || input === "0") return "$";

  return `$${input}`;

}



/** Full-screen finalise sale — numeric keypad, tender entry, and payment methods. */

export function FinaliseSalePage() {

  const sell = useSellScreen();

  const router = useRouter();

  const [tenderInput, setTenderInput] = useState("");

  const [phase, setPhase] = useState<CheckoutPhase>("idle");

  const [error, setError] = useState<string | null>(null);

  const [saleId, setSaleId] = useState<string | number | null>(null);

  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);

  const [appliedPayments, setAppliedPayments] = useState<AppliedPayment[]>([]);

  const [checkoutResult, setCheckoutResult] = useState<{

    change: number;

    invoiceId: string | null;

    gst: number | null;

    rounding: number | null;

  } | null>(null);

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const inFlight = useRef(false);

  const accumulatedChange = useRef(0);

  const completing = useRef(false);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);



  const total = sell.total;

  const tendered = parseTender(tenderInput);

  const remaining =

    remainingBalance ?? Math.max(0, Math.round((total - appliedPayments.reduce((s, p) => s + p.amount, 0)) * 100) / 100);

  const previewRemaining =

    saleId == null

      ? Math.max(0, Math.round((remaining - (tendered > 0 ? tendered : 0)) * 100) / 100)

      : remaining;

  const { whole: totalWhole, cents: totalCents } = splitMoney(total);



  useEffect(() => {

    if (sell.lines.length === 0 && phase !== "approved") {

      router.replace("/");

    }

  }, [sell.lines.length, phase, router]);



  function appendDigit(digit: string) {

    if (phase !== "idle") return;

    setTenderInput((prev) => {

      if (digit === ".") {

        if (prev.includes(".")) return prev;

        return prev === "" ? "0." : `${prev}.`;

      }

      if (prev === "0" && digit !== ".") return digit;

      return prev + digit;

    });

  }



  function backspace() {

    if (phase !== "idle") return;

    setTenderInput((prev) => prev.slice(0, -1));

  }



  async function pay(method: (typeof PAYMENT_METHODS)[number]) {

    if (inFlight.current || sell.lines.length === 0 || phase === "approved") return;



    const isCard = method.id === "eftpos" || method.id === "eftpos-no-cashout";

    const isCash = method.id === "cash";

    const cashDue = roundCashToFiveCents(remaining);

    const amount = isCard

      ? remaining

      : tendered > 0

        ? tendered

        : isCash

          ? cashDue

          : remaining;



    if (amount <= 0) {

      setError("Enter an amount or wait until there is a balance remaining.");

      setPhase("error");

      return;

    }

    if (isCash) {

      const partial = amount + 0.001 < cashDue && amount + 0.001 < remaining;

      if (!partial && amount + 0.001 < cashDue) {

        setError(`Cash must be at least $${cashDue.toFixed(2)} (nearest 5c).`);

        setPhase("error");

        return;

      }

    } else if (amount > remaining + 0.001) {

      setError(`Amount $${amount.toFixed(2)} exceeds remaining balance $${remaining.toFixed(2)}.`);

      setPhase("error");

      return;

    }



    inFlight.current = true;

    setPhase("processing");

    setError(null);



    try {

      const res = await checkoutSale({

        tender: method.tender,

        customerId: sell.customer?.id ?? null,

        saleId,

        tendered: amount,

        items:

          saleId == null

            ? sell.lines.map(toCheckoutItem)

            : undefined,

      });



      setSaleId(res.saleId);

      setRemainingBalance(res.remaining);

      setAppliedPayments((prev) => [...prev, { method: method.label, amount: res.tendered }]);

      setTenderInput("");

      accumulatedChange.current += res.change;



      if (res.completed) {

        setCheckoutResult({

          change: accumulatedChange.current,

          invoiceId: res.invoiceId,

          gst: res.gst ?? null,

          rounding: res.rounding ?? null,

        });

        setPhase("approved");

      } else {

        setPhase("idle");

      }

    } catch (e: unknown) {

      const msg =

        e instanceof ApiError

          ? e.status === 401

            ? "You must be signed in to take a payment."

            : e.message

          : "Could not reach the payment service. Is the backend running?";

      setError(msg);

      setPhase("error");

    } finally {

      inFlight.current = false;

    }

  }



  function completeAndReturn() {

    if (completing.current) return;

    completing.current = true;

    sell.completeSale();

    router.push("/");

  }



  useEffect(() => {

    if (phase !== "approved") {

      setSecondsLeft(null);

      return;

    }

    setSecondsLeft(AUTO_COMPLETE_SECONDS);

    const started = Date.now();

    const id = window.setInterval(() => {

      const left = AUTO_COMPLETE_SECONDS - Math.floor((Date.now() - started) / 1000);

      if (left <= 0) {

        window.clearInterval(id);

        setSecondsLeft(0);

        completeAndReturn();

        return;

      }

      setSecondsLeft(left);

    }, 200);

    return () => window.clearInterval(id);

    // completeAndReturn is stable for this screen; the timer must only restart when approval begins.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [phase]);



  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"] as const;



  return (

    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-[var(--oh-surface)] p-2 font-sans sm:p-4 md:p-5 lg:overflow-hidden">

      <div className="flex w-full min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-4">

        {/* Main — keypad + payment methods */}

        <section className="flex min-w-0 w-full flex-col rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:min-h-0 lg:flex-1 lg:overflow-hidden">

          <div className="shrink-0 border-b border-[var(--oh-border)] px-4 py-3 text-center sm:py-4">

            <h1 className="text-[20px] font-semibold text-[var(--oh-text)] sm:text-[22px]">Finalise Sale</h1>

          </div>



          <div className="flex w-full min-w-0 flex-col items-center justify-start gap-4 p-3 sm:gap-8 sm:p-6 lg:min-h-0 lg:flex-1 lg:justify-center lg:overflow-y-auto">

            {/* Keypad */}

            <div className="w-full min-w-0 max-w-[320px]">

              <div className="mb-4 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-5 text-center">

                <span className="text-[36px] font-bold leading-none tracking-tight text-[var(--oh-text)]">

                  {formatDisplay(tenderInput)}

                </span>

              </div>



              <div className="grid grid-cols-3 gap-2">

                {keys.map((key) => {

                  const isSpecial = key === "." || key === "backspace";

                  return (

                    <button

                      key={key}

                      type="button"

                      disabled={phase !== "idle"}

                      onClick={() => (key === "backspace" ? backspace() : appendDigit(key))}

                      className={cn(

                        "flex h-12 cursor-pointer items-center justify-center rounded-[var(--oh-radius)] text-[20px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:text-[22px]",

                        isSpecial

                          ? "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"

                          : "border border-[var(--oh-tile-blue-border)] bg-white text-[var(--oh-tile-blue-text)] hover:bg-[var(--oh-tile-blue-bg)]",

                      )}

                    >

                      {key === "backspace" ? (

                        <DeleteIcon size={22} strokeWidth={2} />

                      ) : (

                        key

                      )}

                    </button>

                  );

                })}

              </div>

            </div>



            {/* Payment methods */}

            <div className="grid w-full min-w-0 max-w-[720px] grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">

              {PAYMENT_METHODS.map((method) => (

                <button

                  key={method.id}

                  type="button"

                  disabled={phase === "processing"}

                  onClick={() => pay(method)}

                  className={cn(

                    "cursor-pointer rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 py-3 text-[12px] font-semibold leading-snug text-[var(--oh-text)] transition-colors sm:px-3 sm:py-4 sm:text-[13px]",

                    "hover:border-[var(--oh-orange)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50",

                    phase === "processing" && "animate-pulse",

                  )}

                >

                  {method.label}

                </button>

              ))}

            </div>



            {phase === "processing" && (

              <div className="flex items-center gap-3 text-[14px] text-[var(--oh-text-secondary)]">

                <span

                  aria-hidden

                  className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--oh-border)] border-t-[var(--oh-orange)]"

                />

                Processing payment…

              </div>

            )}



            {phase === "error" && error && (

              <div className="max-w-md rounded-[var(--oh-radius)] border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-3 text-center text-[14px] text-[var(--oh-tile-red-text)]">

                {error}

                <div className="mt-3">

                  <AdminSecondaryButton onClick={() => setPhase("idle")}>Try again</AdminSecondaryButton>

                </div>

              </div>

            )}



            {appliedPayments.length > 0 && phase !== "approved" && (

              <div className="w-full max-w-md rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3">

                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">

                  Payments applied

                </p>

                <ul className="space-y-1 text-[13px] text-[var(--oh-text)]">

                  {appliedPayments.map((p, i) => (

                    <li key={`${p.method}-${i}`} className="flex justify-between">

                      <span>{p.method}</span>

                      <span className="font-semibold">${p.amount.toFixed(2)}</span>

                    </li>

                  ))}

                </ul>

                <p className="mt-2 border-t border-[var(--oh-border)] pt-2 text-[12px] text-[var(--oh-text-secondary)]">
                  Total includes GST of ${sell.gstTotal.toFixed(2)}
                </p>

              </div>

            )}



            {phase === "approved" && checkoutResult && (

              <div className="max-w-md rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-6 py-5 text-center">

                <p className="text-[20px] font-bold uppercase text-[var(--oh-success)]">Approved</p>

                <div className="mt-3 text-left">

                  <GstSummary

                    total={sell.total}

                    gst={checkoutResult.gst ?? sell.gstTotal}

                    pricesIncludeGst={sell.pricesIncludeGst}

                    showCash={(checkoutResult.rounding ?? 0) !== 0}

                  />

                </div>

                <p className="mt-2 text-[14px] text-[var(--oh-text-secondary)]">

                  Change: ${checkoutResult.change.toFixed(2)}

                </p>

                {checkoutResult.invoiceId && (

                  <p className="mt-1 text-[12px] text-[var(--oh-muted)]">

                    Invoice {checkoutResult.invoiceId}

                  </p>

                )}

                <p className="mt-3 text-[13px] text-[var(--oh-text-secondary)]">

                  {secondsLeft != null && secondsLeft > 0

                    ? `Returning to sale in ${secondsLeft}s`

                    : "Returning to sale…"}

                </p>

                <button

                  type="button"

                  onClick={completeAndReturn}

                  className="mt-4 cursor-pointer rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-[var(--oh-primary-hover)]"

                >

                  Complete Sale

                </button>

              </div>

            )}

          </div>

        </section>



        {/* Sidebar — customer, cart summary, return */}

        <FinaliseSidebar

          remainingWhole={splitMoney(previewRemaining).whole}

          remainingCents={splitMoney(previewRemaining).cents}

          totalWhole={totalWhole}

          totalCents={totalCents}

          appliedPayments={appliedPayments}

          onReturn={() => (phase === "approved" ? completeAndReturn() : router.push("/"))}

          onAddCustomer={() => setCustomerPickerOpen(true)}

        />

      </div>



      {customerPickerOpen && (

        <CustomerPickerModal onClose={() => setCustomerPickerOpen(false)} />

      )}

    </div>

  );

}



function FinaliseSidebar({

  totalWhole,

  totalCents,

  remainingWhole,

  remainingCents,

  appliedPayments,

  onReturn,

  onAddCustomer,

}: {

  totalWhole: string;

  totalCents: string;

  remainingWhole: string;

  remainingCents: string;

  appliedPayments: AppliedPayment[];

  onReturn: () => void;

  onAddCustomer: () => void;

}) {

  const sell = useSellScreen();

  const hasItems = sell.lines.length > 0;



  return (

    <aside className="flex w-full min-w-0 shrink-0 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:w-[360px] xl:w-[380px]">

      {/* Customer */}

      <div className="border-b border-[var(--oh-border)] px-4 py-3">

        {sell.customer ? (

          <div className="flex items-center gap-3">

            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--oh-navy)] text-[13px] font-bold text-white">

              {sell.customer.name.charAt(0)}

            </span>

            <div className="min-w-0 flex-1">

              <p className="truncate text-[14px] font-medium text-[var(--oh-text)]">

                {sell.customer.name}

              </p>

              <p className="text-[12px] text-[var(--oh-muted)]">

                {sell.customer.loyaltyPoints} loyalty points

              </p>

            </div>

            <button

              type="button"

              aria-label="Remove customer"

              onClick={() => sell.setCustomer(null)}

              className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"

            >

              <XIcon size={16} />

            </button>

          </div>

        ) : (

          <button

            type="button"

            onClick={onAddCustomer}

            className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--oh-border)] px-3 py-2.5 text-[13px] font-medium text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"

          >

            <PlusIcon size={15} strokeWidth={1.75} />

            Add customer

          </button>

        )}

      </div>



      {/* Cart lines */}

      <div className="max-h-40 overflow-y-auto lg:max-h-none lg:min-h-[120px] lg:flex-1">

        {!hasItems ? (

          <p className="px-4 py-8 text-center text-[13px] text-[var(--oh-muted)]">No items</p>

        ) : (

          <ul className="divide-y divide-[var(--oh-border)]">

            {sell.lines.map((line) => {

              const isReturn = line.qty < 0;

              const lineTotal = splitMoney(Math.abs(lineNetTotal(line)));

              return (

                <li

                  key={line.id}

                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    isReturn && "bg-[var(--oh-tile-red-bg)]/80",
                  )}

                >

                  <span className={cn(
                    "w-6 shrink-0 text-[13px] font-semibold",
                    isReturn ? "text-[var(--oh-danger)]" : "text-[var(--oh-text-secondary)]",
                  )}>

                    {line.qty}

                  </span>

                  <span className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    isReturn ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]",
                  )}>

                    {isReturn ? "Return · " : ""}{line.name}

                  </span>

                  <span className={cn(
                    "shrink-0 text-[13px] font-semibold",
                    isReturn ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]",
                  )}>

                    {isReturn ? "−" : ""}${lineTotal.whole}.{lineTotal.cents}

                  </span>

                </li>

              );

            })}

          </ul>

        )}

      </div>



      {/* Total / Remaining + Return */}

      <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/50">

        {appliedPayments.length > 0 && (

          <div className="border-b border-[var(--oh-border)] px-4 py-3">

            <p className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">

              Paid

            </p>

            <ul className="space-y-1 text-[12px] text-[var(--oh-text-secondary)]">

              {appliedPayments.map((p, i) => (

                <li key={`${p.method}-${i}`} className="flex justify-between">

                  <span className="truncate pr-2">{p.method}</span>

                  <span className="shrink-0 font-medium">${p.amount.toFixed(2)}</span>

                </li>

              ))}

            </ul>

          </div>

        )}

        <div className="px-4 pt-4">

          <GstSummary

            total={sell.total}

            gst={sell.gstTotal}

            pricesIncludeGst={sell.pricesIncludeGst}

            onTogglePrices={sell.setPricesIncludeGst}

            showCash

          />

        </div>

        <div className="grid grid-cols-2 gap-4 px-4 py-4">

          <div>

            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">

              Total

            </p>

            <p className="text-[24px] font-bold leading-none text-[var(--oh-text)]">

              ${totalWhole}

              <span className="text-[16px]">.{totalCents}</span>

            </p>

          </div>

          <div className="text-right">

            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">

              Remaining

            </p>

            <p className="text-[24px] font-bold leading-none text-[var(--oh-orange)]">

              ${remainingWhole}

              <span className="text-[16px]">.{remainingCents}</span>

            </p>

          </div>

        </div>

        <p className="px-4 pb-3 text-[12px] text-[var(--oh-text-secondary)]">
          Total includes GST of ${sell.gstTotal.toFixed(2)}
        </p>



        <button

          type="button"

          onClick={onReturn}

          className="w-full cursor-pointer border-t border-[var(--oh-border)] bg-[var(--oh-navy)] py-4 pr-16 text-[14px] font-semibold uppercase tracking-wide text-white transition-colors hover:brightness-110 lg:pr-4"

        >

          Return to Sale

        </button>

      </div>

    </aside>

  );

}



function CustomerPickerModal({ onClose }: { onClose: () => void }) {

  const sell = useSellScreen();

  const [q, setQ] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(() => {

    sell.loadCustomers();

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, []);



  function onSearch(value: string) {

    setQ(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => sell.loadCustomers(value), 250);

  }



  function pick(c: Customer) {

    sell.setCustomer(c);

    onClose();

  }



  return (

    <div

      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 font-sans"

      onClick={onClose}

    >

      <div

        role="dialog"

        aria-label="Select customer"

        className="flex max-h-[80vh] w-[420px] max-w-[90vw] flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-xl"

        onClick={(e) => e.stopPropagation()}

      >

        <div className="flex items-center justify-between border-b border-[var(--oh-border)] px-4 py-3">

          <h3 className="text-[16px] font-semibold text-[var(--oh-text)]">Add customer</h3>

          <button

            type="button"

            aria-label="Close"

            onClick={onClose}

            className="cursor-pointer text-[var(--oh-muted)] hover:text-[var(--oh-text)]"

          >

            <XIcon size={18} />

          </button>

        </div>

        <div className="border-b border-[var(--oh-border)] px-4 py-3">

          <input

            type="text"

            value={q}

            placeholder="Search customers…"

            onChange={(e) => onSearch(e.target.value)}

            className="h-9 w-full rounded-lg border border-[var(--oh-border)] px-3 text-[13px] outline-none focus:border-[var(--oh-orange)]"

            autoFocus

          />

        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-[var(--oh-border)]">

          {sell.customers.map((c) => (

            <li key={c.id}>

              <button

                type="button"

                onClick={() => pick(c)}

                className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-[var(--oh-surface)]"

              >

                <span>

                  <span className="block text-[14px] font-medium text-[var(--oh-text)]">{c.name}</span>

                  <span className="block text-[12px] text-[var(--oh-muted)]">{c.group}</span>

                </span>

                <span className="text-[12px] text-[var(--oh-muted)]">{c.loyaltyPoints} pts</span>

              </button>

            </li>

          ))}

        </ul>

        {sell.customers.length === 0 && (

          <p className="py-6 text-center text-[13px] text-[var(--oh-muted)]">No customers found</p>

        )}

      </div>

    </div>

  );

}

