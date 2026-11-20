import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("login form is labelled and has no axe violations", async ({ page }) => {
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
  await page.addInitScript(() => {
    const permissions = navigator.permissions;
    if (!permissions?.query) return;
    const original = permissions.query.bind(permissions);
    permissions.query = async (descriptor) => {
      const name = typeof descriptor === "object" && descriptor && "name" in descriptor ? String(descriptor.name) : "";
      if (name === "loopback-network" || name === "local-network") {
        return {
          state: "granted",
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as PermissionStatus;
      }
      return original(descriptor);
    };
  });
  await page.goto("/settings/hardware");

  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test drawer" })).toBeDisabled();
  await page.getByText("More · brand, drawer pin, docket").click();
  await expect(page.getByLabel("Cash drawer kick code")).toHaveValue("27, 112, 0, 25, 250");
  await page.getByRole("button", { name: "Connect local bridge" }).click();
  await expect(page.getByRole("status").filter({
    hasText: /Start Orithos Hardware Connect on this PC/,
  })).toBeVisible({ timeout: 15_000 });
  await page.getByText("EFTPOS integration · Linkly").click();
  const paymentsToggle = page.getByRole("checkbox", { name: "Allow card payments on Sell" });
  await expect(paymentsToggle).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Test $1.00" })).toBeDisabled();

  await page.getByText("Scanner & scale tests").click();
  const scannerInput = page.getByLabel("Barcode input check");
  await scannerInput.fill("0001234567890");
  await scannerInput.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Barcode input captured: 0001234567890" })).toBeVisible();
});
