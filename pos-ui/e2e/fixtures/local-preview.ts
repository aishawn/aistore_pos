import type { Page } from "@playwright/test";

export async function useLocalPreviewSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sf_user", JSON.stringify({
      id: "e2e-fixture-user",
      name: "E2E Fixture User",
      username: "e2e-fixture",
      isAdmin: false,
      roleCode: "CLERK",
      permissions: [],
    }));
  });
  await page.context().addCookies([{
    name: "orithos_local_preview",
    value: "1",
    domain: "127.0.0.1",
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  }]);

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/refresh") {
      await route.fulfill({ status: 401, json: { code: 40100, message: "No test session" } });
      return;
    }
    await route.abort("failed");
  });
}

export async function fulfillApiJson(page: Page, pathname: string, data: unknown) {
  await page.route(`**${pathname}**`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 0, message: "ok", data }),
  }));
}
