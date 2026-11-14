import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PURCHASE_COLUMNS,
  filterPurchaseRows,
  purchaseFooterTotals,
  sortPurchaseRows,
  type PurchaseReportRow,
} from "./purchase-report.ts";

const rows: PurchaseReportRow[] = [
  {
    id: 1,
    name: "Collaborations at St Kilda Road",
    orderCount: 12,
    totalCost: 8576.94,
    fees: 4.95,
    freight: 0,
    paymentFees: null,
    taxAmount: null,
    feesAvailable: true,
    freightAvailable: true,
    paymentFeesAvailable: false,
    taxAvailable: false,
  },
  {
    id: 2,
    name: "Demo Outlet",
    orderCount: 3,
    totalCost: 120.5,
    fees: null,
    freight: null,
    paymentFees: null,
    taxAmount: null,
    feesAvailable: false,
    freightAvailable: false,
    paymentFeesAvailable: false,
    taxAvailable: false,
  },
];

test("default purchase columns match Shopfront purchase report", () => {
  assert.deepEqual(DEFAULT_PURCHASE_COLUMNS, [
    "name",
    "totalCost",
    "fees",
    "freight",
    "paymentFees",
    "taxAmount",
  ]);
});

test("filterPurchaseRows matches name substring", () => {
  assert.equal(filterPurchaseRows(rows, "st kilda").length, 1);
  assert.equal(filterPurchaseRows(rows, "demo").length, 1);
  assert.equal(filterPurchaseRows(rows, "").length, 2);
});

test("sortPurchaseRows orders by total cost descending with nulls last", () => {
  const sorted = sortPurchaseRows(rows, "totalCost", "desc");
  assert.equal(sorted[0].name, "Collaborations at St Kilda Road");
  assert.equal(sorted[1].name, "Demo Outlet");
});

test("sortPurchaseRows defaults name values to natural ascending order with stable ids", () => {
  const rows = [
    { ...rowsTemplate("Item 10", 10), id: 3 },
    { ...rowsTemplate("Item 2", 2), id: 2 },
    { ...rowsTemplate("item 2", 1), id: 1 },
  ];
  assert.deepEqual(sortPurchaseRows(rows, "name", "asc").map((row) => row.id), [1, 2, 3]);
});

function rowsTemplate(name: string, orderCount: number): PurchaseReportRow {
  return {
    name,
    orderCount,
    totalCost: 0,
    fees: null,
    freight: null,
    paymentFees: null,
    taxAmount: null,
    feesAvailable: false,
    freightAvailable: false,
    paymentFeesAvailable: false,
    taxAvailable: false,
  };
}

test("purchaseFooterTotals sums available money fields only", () => {
  const totals = purchaseFooterTotals(rows);
  assert.equal(totals.orderCount, 15);
  assert.equal(totals.totalCost, 8697.44);
  assert.equal(totals.fees, 4.95);
  assert.equal(totals.freight, 0);
  assert.equal(totals.paymentFees, null);
  assert.equal(totals.taxAmount, null);
});
