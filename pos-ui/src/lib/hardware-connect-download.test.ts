import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseHardwareConnectSetupUrl,
  ORITHOS_HC_OFFICIAL_WINDOWS_URL,
} from "./hardware-connect-download.ts";

test("uses an explicitly configured Hardware Connect download URL", () => {
  assert.equal(
    chooseHardwareConnectSetupUrl(" https://downloads.example.test/agent.exe ", true),
    "https://downloads.example.test/agent.exe",
  );
});

test("uses the same-origin setup route for a verified staged installer", () => {
  assert.equal(chooseHardwareConnectSetupUrl(undefined, true), "/downloads/orithos-hardware-connect-setup");
});

test("falls back to the official release when no verified local installer exists", () => {
  assert.equal(chooseHardwareConnectSetupUrl(undefined, false), ORITHOS_HC_OFFICIAL_WINDOWS_URL);
});
