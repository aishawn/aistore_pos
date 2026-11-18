import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("login form is labelled and has no axe violations", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
