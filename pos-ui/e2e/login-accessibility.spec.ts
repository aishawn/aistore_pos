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
