import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantFollowupCases,
  resolveFollowupCredentials,
  summarizeSalesFollowupEvidence,
} from "./assistant-followup-cases.mjs";

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

test("saved sales follow-up evidence omits business totals and exact watermarks", () => {
  const summary = summarizeSalesFollowupEvidence({
    passed: true,
    dateRange: true,
    nativeReport: true,
    answerMatchesNativeReport: true,
    dataSource: true,
    storeScope: true,
    timeZone: true,
    dataStatus: true,
    dataAsOfFresh: true,
    noWrites: true,
    reportStatus: "available",
    reportTransactions: 27,
    reportRevenue: 1234.56,
    dataAsOf: "2026-11-27T10:30:00Z",
  });

  assert.deepEqual(summary, {
    passed: true,
    dateRange: true,
    nativeReport: true,
    answerMatchesNativeReport: true,
    dataSource: true,
    storeScope: true,
    timeZone: true,
    dataStatus: true,
    dataAsOfFresh: true,
    noWrites: true,
    reportStatus: "available",
  });
});
