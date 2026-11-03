export interface DailySalesGroup {
  date: string;
  transactions: number;
  amount: number;
  tax: number;
}

export interface DailySalesSummary {
  date: string;
  salesTransactions: number;
  refundTransactions: number;
  salesAmount: number;
  refundAmount: number;
  netSales: number;
  tax: number;
}

export function mergeDailySalesGroups(groups: DailySalesGroup[]): DailySalesSummary[] {
  const merged = new Map<string, DailySalesSummary>();
  for (const group of groups) {
    const current = merged.get(group.date) ?? { date: group.date, salesTransactions: 0, refundTransactions: 0, salesAmount: 0, refundAmount: 0, netSales: 0, tax: 0 };
    if (group.amount < 0) {
      current.refundTransactions += group.transactions;
      current.refundAmount += Math.abs(group.amount);
      current.tax -= Math.abs(group.tax);
    } else {
      current.salesTransactions += group.transactions;
      current.salesAmount += group.amount;
      current.tax += group.tax;
    }
    current.netSales = current.salesAmount - current.refundAmount;
    merged.set(group.date, current);
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Odoo labels are localized; __range contains the authoritative UTC boundary. */
export function parseDailySalesGroup(row: Record<string, unknown>, timezone: string): DailySalesGroup {
  const ranges = row.__range as Record<string, { from?: string }> | undefined;
  const from = ranges?.["date_order:day"]?.from;
  if (!from) throw new Error("Daily sales date range is missing");
  const instant = new Date(from.includes("T") ? from : `${from.replace(" ", "T")}Z`);
  if (!Number.isFinite(instant.getTime())) throw new Error("Daily sales date range is invalid");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, transactions: Number(row.__count ?? row.date_order_count ?? 0), amount: Number(row.amount_total ?? 0), tax: Number(row.amount_tax ?? 0) };
}
