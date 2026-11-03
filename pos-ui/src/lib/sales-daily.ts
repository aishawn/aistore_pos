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
