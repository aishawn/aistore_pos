export type RegisterClosureCashRow = {
  expected: number | null;
  received: number | null;
  difference: number | null;
};

export function summarizeRegisterClosures(rows: RegisterClosureCashRow[]) {
  const expectedRows = rows.filter((row) => row.expected !== null);
  const receivedRows = rows.filter((row) => row.received !== null);
  const comparableRows = rows.filter((row) => row.difference !== null);
  const roundCents = (value: number) => Math.round(value * 100) / 100;

  return {
    sessionCount: rows.length,
    expectedCash: roundCents(expectedRows.reduce((sum, row) => sum + (row.expected ?? 0), 0)),
    receivedCash: roundCents(receivedRows.reduce((sum, row) => sum + (row.received ?? 0), 0)),
    cashDifference: roundCents(comparableRows.reduce((sum, row) => sum + (row.difference ?? 0), 0)),
    comparableSessionCount: comparableRows.length,
    missingCashCount: rows.length - comparableRows.length,
  };
}
