import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  localNetworkAccessBrowserHint,
  resolveHardwareNetworkAccessState,
  resolveLocalNetworkAccessState,
} from "./local-network-access.ts";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value });
}

test("treats missing permission APIs as unsupported", async () => {
  setWindow({ isSecureContext: true });
  assert.equal(await resolveLocalNetworkAccessState(), "unsupported");
});

test("returns granted when loopback and local permissions are granted", async () => {
  setWindow({
    isSecureContext: true,
    navigator: {
      permissions: {
        query: async ({ name }: { name: string }) => ({
          state: "granted",
          addEventListener: () => undefined,
        }),
      },
    },
  });
  assert.equal(await resolveLocalNetworkAccessState(), "granted");
});

test("hardware gate grants when loopback is granted even if local is still prompt", async () => {
  setWindow({
    isSecureContext: true,
    navigator: {
      permissions: {
        query: async ({ name }: { name: string }) => ({
          state: name === "loopback-network" ? "granted" : "prompt",
          addEventListener: () => undefined,
        }),
      },
    },
  });
  assert.equal(await resolveLocalNetworkAccessState(), "prompt");
  assert.equal(await resolveHardwareNetworkAccessState(), "granted");
});

test("flags Chromium builds below the LNA UI baseline", () => {
  setWindow({
    navigator: { userAgent: "Mozilla/5.0 Chrome/141.0.0.0" },
  });
  assert.match(localNetworkAccessBrowserHint() ?? "", /Chrome 141/);
  setWindow({
    navigator: { userAgent: "Mozilla/5.0 Chrome/143.0.0.0 Edg/143.0.0.0" },
  });
  assert.equal(localNetworkAccessBrowserHint(), null);
});

test("returns denied when either granular permission is denied", async () => {
  setWindow({
    isSecureContext: true,
    navigator: {
      permissions: {
        query: async ({ name }: { name: string }) => ({
          state: name === "loopback-network" ? "denied" : "granted",
          addEventListener: () => undefined,
        }),
      },
    },
  });
  assert.equal(await resolveLocalNetworkAccessState(), "denied");
});