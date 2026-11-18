import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resolveLocalNetworkAccessState } from "./local-network-access.ts";

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