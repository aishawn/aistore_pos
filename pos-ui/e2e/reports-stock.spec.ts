import { expect, test } from "@playwright/test";
import { fulfillApiJson, useLocalPreviewSession } from "./fixtures/local-preview";

const reportFixture = {
  source: "orithos_ledger",
  from: "2026-11-17",
  to: "2026-11-17",
  revenue: 1842.5,
  grossSales: 1842.5,
  refunds: 0,
  refundTransactions: 0,
  netRevenue: 1842.5,
  cost: null,
  tax: null,
  discount: 0,
  grossProfit: null,
  profitMargin: null,
  averageSale: 46.06,
  costAvailable: false,
  taxAvailable: false,
  transactions: 40,
  dataAsOf: "2026-11-18T01:00:00Z",
  reportDataStatus: "available",
  dailyTrend: [],
  topProducts: [{ id: 17, name: "Test Shiraz", revenue: 460.25, quantity: 10 }],
};

test("reports dashboard renders ledger totals and cost coverage state", async ({ page }) => {
  await useLocalPreviewSession(page);
  await fulfillApiJson(page, "/api/reports/native-overview", reportFixture);

  await page.goto("/reports/dashboard");

  await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();
  await expect(page.getByText("Data complete")).toBeVisible();
  await expect(page.getByText("$1,842.50").first()).toBeVisible();
  await expect(page.getByText("Profit unverified — cost coverage incomplete")).toBeVisible();
  await expect(page.getByText("Test Shiraz")).toBeVisible();
});

test("stock list renders fixture inventory without exposing write actions", async ({ page }) => {
  await useLocalPreviewSession(page);
  await fulfillApiJson(page, "/api/products", {
    items: [{
      id: 701,
      name: "E2E Fixture Shiraz",
      status: "ACTIVE",
      price: 24.5,
      stockQuantity: 8,
      categoryId: 31,
      categoryName: "Red wine",
    }],
    total: 1,
    page: 1,
    size: 40,
  });
  await fulfillApiJson(page, "/api/products/filter-options", { categories: [] });

  await page.goto("/stock/list");

  await expect(page.getByRole("heading", { name: "Stock list" })).toBeVisible();
  const productName = page.getByRole("textbox", { name: "Product name for E2E Fixture Shiraz" });
  await expect(productName).toHaveValue("E2E Fixture Shiraz");
  await expect(productName).toHaveAttribute("readonly", "");
  await expect(page.getByRole("textbox", { name: "Price for E2E Fixture Shiraz" })).toHaveAttribute("readonly", "");
  await expect(page.getByText("8", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export to CSV" })).toBeVisible();
});
