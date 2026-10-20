import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3000";
const browser = await chromium.launch({
  headless: true,
  args: ["--host-resolver-rules=MAP demo.localhost 127.0.0.1"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const blockedBusinessWrites = [];
const deleteRequests = [];
let assistantRequests = 0;

await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
await context.addInitScript(() => {
  localStorage.setItem("sf_token", "local-uat-session");
  localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
    assistantRequests += 1;
    const question = String(JSON.parse(request.postData() ?? "{}").question ?? "").toLowerCase();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        message: "OK",
        data: {
          threadId: "entity-invalid-op-fixture",
          intent: "entity_action",
          intentSummary: question.startsWith("delete") ? "Delete customer" : "Archive customer",
          answer: "Fixture response received.",
          slots: { entity: "customer", op: question.startsWith("delete") ? "delete" : "archive", query: "Alex Example" },
          ui: null,
        },
      }),
    });
  }
  if (request.method() === "DELETE" && url.pathname === "/api/customers/777") {
    deleteRequests.push(`${request.method()} ${url.pathname}`);
    if (deleteRequests.length === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50300, message: "UAT delete fixture failure" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: null }) });
  }
  if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS") {
    blockedBusinessWrites.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "UAT blocked API write" }) });
  }
  const data = url.pathname === "/api/ai/config/client"
    ? { enabled: true, assistantAvailable: true, aiTriggerKeywords: [] }
    : url.pathname === "/api/customers"
      ? { items: [{ id: "777", name: "Alex Example", customerGroupName: "Default" }] }
      : [];
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
});

let result;
try {
  await page.goto(`${base}/overview?__uat_entity_guard=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await trigger.waitFor({ state: "visible", timeout: 30000 });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  await dialog.getByRole("textbox", { name: "Ask Orithos AI" }).fill("archive customer Alex Example");
  await dialog.getByRole("button", { name: "Send message" }).click();
  await dialog.getByText("That action is not supported. Try listing or searching for the item instead.", { exact: true }).waitFor({ timeout: 10000 });
  const routeUnchangedAfterInvalidOp = new URL(page.url()).pathname === "/overview";

  await dialog.getByRole("textbox", { name: "Ask Orithos AI" }).fill("delete customer Alex Example");
  await dialog.getByRole("button", { name: "Send message" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Confirm Delete" });
  await confirm.waitFor({ state: "visible", timeout: 10000 });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.waitFor({ state: "hidden", timeout: 10000 });
  const cancelSentNoDelete = deleteRequests.length === 0;

  await dialog.getByRole("textbox", { name: "Ask Orithos AI" }).fill("delete customer Alex Example");
  await dialog.getByRole("button", { name: "Send message" }).click();
  const secondConfirm = page.getByRole("alertdialog", { name: "Confirm Delete" });
  await secondConfirm.waitFor({ state: "visible", timeout: 10000 });
  await secondConfirm.getByRole("button", { name: "Delete", exact: true }).evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await dialog.getByText("UAT delete fixture failure", { exact: true }).waitFor({ timeout: 10000 });
  const failureKeptConfirmationOpen = await secondConfirm.isVisible();
  await secondConfirm.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Deleted customer “Alex Example”.", { exact: true }).waitFor({ timeout: 10000 });
  result = {
    routeUnchanged: routeUnchangedAfterInvalidOp && new URL(page.url()).pathname === "/overview",
    unsupportedActionExplained: true,
    deleteConfirmationShown: true,
    cancelDismissedConfirmation: true,
    cancelSentNoDelete,
    failureKeptConfirmationOpen,
    retryCompletedDelete: deleteRequests.length === 2
      && deleteRequests.every((request) => request === "DELETE /api/customers/777"),
    assistantRequests,
    deleteRequests,
    blockedBusinessWrites,
    pageErrors,
  };
} catch (error) {
  result = {
    routeUnchanged: false,
    unsupportedActionExplained: false,
    deleteConfirmationShown: false,
    cancelDismissedConfirmation: false,
    cancelSentNoDelete: false,
    failureKeptConfirmationOpen: false,
    retryCompletedDelete: false,
    assistantRequests,
    deleteRequests,
    blockedBusinessWrites,
    pageErrors,
    failure: error instanceof Error ? error.message : "UNEXPECTED_FAILURE",
  };
} finally {
  await context.close();
  await browser.close();
}

const passed = result.routeUnchanged
  && result.unsupportedActionExplained
  && result.deleteConfirmationShown
  && result.cancelDismissedConfirmation
  && result.cancelSentNoDelete
  && result.failureKeptConfirmationOpen
  && result.retryCompletedDelete
  && result.assistantRequests === 3
  && result.blockedBusinessWrites.length === 0
  && result.pageErrors.length === 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeChangesIncluded: true,
  target: base,
  scope: "mocked invalid AI entity operation and delete confirmation; all APIs intercepted; DELETE is fixture-only",
  status: passed ? "PASS" : "FAIL",
  result,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ENTITY_INVALID_OP_LOCAL.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, result }));
if (!passed) process.exitCode = 1;
