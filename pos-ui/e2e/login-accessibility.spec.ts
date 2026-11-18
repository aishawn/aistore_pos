import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { useLocalPreviewSession } from "./fixtures/local-preview";

test("login form is labelled and has no axe violations", async ({ page }) => {
  await useLocalPreviewSession(page);
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("hardware setup reports bridge availability without enabling Linkly payments", async ({ context }) => {
  await context.addCookies([{
    name: "orithos_local_preview",
    value: "1",
    domain: "127.0.0.1",
    path: "/",
  }]);
  const page = await context.newPage();
  await page.route("https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js", (route) => route.abort());
  const qzLoadFailure = page.waitForEvent("requestfailed", (request) => request.url().includes("cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"));
  await page.goto("/settings/hardware");
  await qzLoadFailure;

  await expect(page.getByRole("heading", { name: "Local hardware bridge" })).toBeVisible();
  await page.getByRole("button", { name: "Connect local bridge" }).click();
  await expect(page.getByRole("status").filter({
    hasText: /QZ Tray browser library failed to load|QZ Tray is not installed or unavailable in this browser/,
  })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Adapter required; payments disabled")).toBeVisible();
  await expect(page.getByText("Linkly payments remain disabled and are not recorded by this POS.")).toBeVisible();
  await expect(page.getByText(/RS232.*not supported.*USB HID/i)).toBeVisible();

  const scannerInput = page.getByLabel("Barcode input check");
  await scannerInput.fill("0001234567890");
  await scannerInput.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Barcode input captured: 0001234567890" })).toBeVisible();
});