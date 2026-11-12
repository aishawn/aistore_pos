import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readSettingsImportStatus, triggerSettingsImport } from "./shopfront-settings-import-route.ts";

const ACCESS_COOKIE = "orithos_access_token";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BACKEND_URL: process.env.BACKEND_URL,
  SHOPFRONT_CRAWLER_BASE_URL: process.env.SHOPFRONT_CRAWLER_BASE_URL,
  SHOPFRONT_INTEGRATION_TOKEN: process.env.SHOPFRONT_INTEGRATION_TOKEN,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function request(path: string, method: "GET" | "POST", body?: unknown) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return new Request(`https://demo.orithos.com.au${path}`, {
    method,
    headers: {
      cookie: `${ACCESS_COOKIE}=header.${payload}.signature`,
      origin: "https://demo.orithos.com.au",
      host: "demo.orithos.com.au",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function setupEnv() {
  process.env.BACKEND_URL = "https://backend.test";
  process.env.SHOPFRONT_CRAWLER_BASE_URL = "https://crawler.test";
  process.env.SHOPFRONT_INTEGRATION_TOKEN = "server-only-token";
}

test("settings import trigger verifies permissions and sends the token only to the crawler", async () => {
  setupEnv();
  const calls: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const authorization = new Headers(init?.headers).get("Authorization");
    calls.push({ url, authorization });
    if (url === "https://backend.test/api/auth/me") {
      return Response.json({ code: 0, data: { permissions: ["settings.integrations"] } });
    }
    if (url === "https://crawler.test/api/stores/skr/settings/import") {
      return Response.json({ status: "queued", job_id: 42, store: "skr" });
    }
    throw new Error("unexpected request");
  };

  const result = await triggerSettingsImport(request("/api/settings/import/promote", "POST", { storeKey: "skr" }));
  const payload = await result.json();

  assert.equal(result.status, 200);
  assert.equal(payload.code, 0);
  assert.equal(payload.data.job_id, 42);
  assert.equal(calls[0].authorization?.startsWith("Bearer header."), true);
  assert.equal(calls[1].authorization, "Bearer server-only-token");
});

test("settings import status returns only the latest settings job summary", async () => {
  setupEnv();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://backend.test/api/auth/me") {
      return Response.json({ code: 0, data: { isAdmin: true } });
    }
    if (url === "https://crawler.test/api/sync/status?store=skr") {
      return Response.json({ data: [
        { id: 5, type: "daily_sync", status: "completed" },
        { id: 6, type: "settings_import", status: "running", phase: "promote", payload: { sensitive: true } },
      ] });
    }
    throw new Error("unexpected request");
  };

  const result = await readSettingsImportStatus(request("/api/settings/import/promote", "GET"));
  const payload = await result.json();

  assert.equal(result.status, 200, JSON.stringify(payload));
  assert.deepEqual(payload.data, { job_id: 6, status: "running", phase: "promote" });
});

test("settings import rejects users without integration permission before contacting crawler", async () => {
  setupEnv();
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return Response.json({ code: 0, data: { isAdmin: false, permissions: ["settings.view"] } });
  };

  const result = await triggerSettingsImport(request("/api/settings/import/promote", "POST", { storeKey: "skr" }));
  const payload = await result.json();

  assert.equal(result.status, 403);
  assert.equal(payload.code, 40300);
  assert.deepEqual(calls, ["https://backend.test/api/auth/me"]);
});
