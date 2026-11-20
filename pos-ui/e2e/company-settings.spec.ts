import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

type Settings = Record<string, { value: string; datatype: string; orithosOwned: boolean; persisted: boolean }>;

async function installPreviewIdentity(page: Page, isAdmin: boolean) {
  await page.addInitScript((admin) => {
    localStorage.setItem("sf_user", JSON.stringify({
      id: admin ? "settings-admin" : "settings-clerk",
      name: admin ? "Settings Admin" : "Settings Clerk",
      username: admin ? "settings-admin" : "settings-clerk",
      isAdmin: admin,
      roleCode: admin ? "ADMIN" : "CLERK",
      permissions: [],
    }));
  }, isAdmin);
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
}

function settingsApi(initial: Settings) {
  let current = structuredClone(initial);
  let dateTimeReads = 0;
  return {
    current: () => current,
    dateTimeReads: () => dateTimeReads,
    route: async (route: Route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/settings/company/date-time" && request.method() === "GET") {
        dateTimeReads += 1;
        await route.fulfill({ status: 500, json: { code: 50000, message: "Unexpected server error." } });
        return;
      }
      if (pathname !== "/api/settings/company") {
        await route.continue();
        return;
      }
      if (request.method() === "GET") {
        await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: current } });
        return;
      }
      if (request.method() === "PUT") {
        const changes = request.postDataJSON() as Record<string, string>;
        current = Object.fromEntries(Object.entries(current).map(([key, setting]) => [
          key,
          changes[key] === undefined ? setting : { ...setting, value: changes[key], orithosOwned: true, persisted: true },
        ]));
        await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: current } });
        return;
      }
      await route.fulfill({ status: 405 });
    },
  };
}

const initialSettings: Settings = {
  "company.timezone": { value: "Australia/Adelaide", datatype: "string", orithosOwned: false, persisted: true },
  "company.date_format": { value: "DD/MM/YYYY", datatype: "string", orithosOwned: false, persisted: true },
  "company.time_format": { value: "HH:mm", datatype: "string", orithosOwned: false, persisted: true },
  "company.start_of_week": { value: "MONDAY", datatype: "string", orithosOwned: false, persisted: true },
};

test("company date-time settings save and reload the server-returned values", async ({ page }) => {
  await installPreviewIdentity(page, true);
  const api = settingsApi(initialSettings);
  await page.route("**/api/settings/company**", api.route);
  await page.goto("/settings/company/date-time");

  await expect(page.getByLabel("Timezone")).toHaveValue("Australia/Adelaide");
  await page.getByLabel("Timezone").fill("Australia/Melbourne");
  await page.getByLabel("Time Format").selectOption("HH:mm:ss");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("status")).toContainText("Settings saved to Orithos");
  await expect(page.getByLabel("Timezone")).toHaveValue("Australia/Melbourne");
  await expect(page.getByLabel("Time Format")).toHaveValue("HH:mm:ss");
  expect(api.current()["company.timezone"].orithosOwned).toBe(true);
  expect(api.current()["company.time_format"].value).toBe("HH:mm:ss");
  await page.waitForLoadState("networkidle");
  expect(api.dateTimeReads()).toBe(0);

  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Australia/Melbourne");
  await expect(page.getByLabel("Time Format")).toHaveValue("HH:mm:ss");
});

test("company settings stay read-only without settings permission", async ({ page }) => {
  await installPreviewIdentity(page, false);
  await page.route("**/api/settings/company**", settingsApi(initialSettings).route);
  await page.goto("/settings/company/date-time");

  await expect(page.getByText("Read-only for your account.")).toBeVisible();
  await expect(page.getByLabel("Timezone")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("invalid timezone is rejected before sending a settings update", async ({ page }) => {
  await installPreviewIdentity(page, true);
  const api = settingsApi(initialSettings);
  let updates = 0;
  await page.route("**/api/settings/company**", async (route) => {
    if (route.request().method() === "PUT") updates += 1;
    await api.route(route);
  });
  await page.goto("/settings/company/date-time");

  await page.getByLabel("Timezone").fill("Mars/Phobos");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Timezone must be a valid time zone." })).toBeVisible();
  expect(updates).toBe(0);
});

test("failed settings update reports the error and keeps the edit available", async ({ page }) => {
  await installPreviewIdentity(page, true);
  await page.route("**/api/settings/company**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/settings/company/date-time" && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        json: {
          code: 0,
          message: "ok",
          data: {
            timezone: initialSettings["company.timezone"].value,
            dateFormat: initialSettings["company.date_format"].value,
            timeFormat: initialSettings["company.time_format"].value,
          },
        },
      });
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, json: { code: 0, message: "ok", data: initialSettings } });
      return;
    }
    await route.fulfill({
      status: 500,
      json: { code: 50000, message: "Settings service unavailable." },
    });
  });
  await page.goto("/settings/company/date-time");

  await page.getByLabel("Timezone").fill("Australia/Melbourne");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Settings service unavailable." })).toBeVisible();
  await expect(page.getByLabel("Timezone")).toHaveValue("Australia/Melbourne");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
});
