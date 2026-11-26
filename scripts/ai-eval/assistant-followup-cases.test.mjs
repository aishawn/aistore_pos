import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantFollowupCases, resolveFollowupCredentials } from "./assistant-followup-cases.mjs";

test("assistant follow-up matrix has ten unique read-only scenarios in English and Chinese", () => {
  assert.equal(assistantFollowupCases.length, 10);
  assert.equal(new Set(assistantFollowupCases.map(({ id }) => id)).size, 10);
  assert.equal(assistantFollowupCases.filter(({ language }) => language === "en").length, 5);
  assert.equal(assistantFollowupCases.filter(({ language }) => language === "zh").length, 5);
  assert.ok(assistantFollowupCases.every(({ readOnly, question, followUp, surface, kind }) =>
    readOnly === true && question && followUp && surface && ["sales", "stock-history"].includes(kind)));
  assert.ok(assistantFollowupCases.some(({ expectDayOffset }) => expectDayOffset === -1));
  assert.ok(assistantFollowupCases.some(({ expectDayOffset }) => expectDayOffset === -2));
});

test("follow-up UAT resolves credentials for the selected store", () => {
  assert.deepEqual(resolveFollowupCredentials({
    baseUrl: "https://demo.orithos.com.au",
    processEnv: { INITIAL_ADMIN_PASSWORD: "demo-secret" },
    fileEnv: {},
  }), { username: "admin", password: "demo-secret" });
  assert.deepEqual(resolveFollowupCredentials({
    baseUrl: "https://skr.orithos.com.au",
    processEnv: {},
    fileEnv: { ORITHOS_SKR_USER: "skr-user", ORITHOS_SKR_PASS: "skr-secret" },
  }), { username: "skr-user", password: "skr-secret" });
});
