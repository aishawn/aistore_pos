import { api, type Page } from "@/lib/api";

export interface BalancePrintRow {
  name?: string | null;
  currentOwing?: number | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function printTimestamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function buildPrintHtml(rows: BalancePrintRow[]) {
  const total = rows.reduce((sum, row) => sum + Number(row.currentOwing ?? 0), 0);
  const bodyRows = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.name?.trim() || "—")}</td>
          <td class="amount">${formatMoney(Number(row.currentOwing ?? 0))}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Customer Balances</title>
    <style>
      @page { margin: 16mm; }
      body {
        margin: 0;
        padding: 0;
        color: #000;
        font: 14px/1.4 Arial, Helvetica, sans-serif;
      }
      .timestamp {
        font-size: 12px;
        margin-bottom: 12px;
      }
      h1 {
        margin: 0 0 18px;
        text-align: center;
        font-size: 16px;
        font-weight: 400;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        padding: 4px 0;
        vertical-align: top;
      }
      th {
        font-weight: 700;
        text-align: left;
      }
      th.amount,
      td.amount {
        text-align: right;
        white-space: nowrap;
      }
      tr.total td {
        padding-top: 10px;
        font-weight: 700;
      }
      tr.total td:first-child {
        text-align: right;
        padding-right: 12px;
      }
    </style>
  </head>
  <body>
    <div class="timestamp">${printTimestamp()}</div>
    <h1>Customer Balances | Orithopos</h1>
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th class="amount">Total Balance</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr class="total">
          <td>Total</td>
          <td class="amount">${formatMoney(total)}</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

/** Print via a hidden iframe so no extra tab or page is shown. */
export function printCustomerBalances(rows: BalancePrintRow[]) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden",
  );
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error("Unable to prepare print preview.");
  }

  const cleanup = () => {
    iframe.remove();
  };

  win.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 60_000);

  doc.open();
  doc.write(buildPrintHtml(rows));
  doc.close();

  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
}

type BalanceQuery = Record<string, string | number | boolean | null | undefined>;

/** Fetch all balances matching filters, then open the print dialog. */
export async function fetchAndPrintBalances(query: BalanceQuery) {
  const data = await api.get<Page<BalancePrintRow & { id: string }>>("/api/customers", {
    ...query,
    page: 1,
    size: 10000,
  });
  printCustomerBalances(data.items);
}
