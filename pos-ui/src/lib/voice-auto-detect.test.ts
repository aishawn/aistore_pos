import assert from "node:assert/strict";
import { test } from "node:test";
import { getBrowserVoiceLang } from "./voice.ts";

test("browser speech fallback follows the preferred browser language", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "en-AU", languages: ["zh-CN", "en-AU"] },
    });
    assert.equal(getBrowserVoiceLang(), "zh-CN");

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { language: "en-AU", languages: ["en-AU"] },
    });
    assert.equal(getBrowserVoiceLang(), "en-AU");
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
