import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STORE_DATE_TIME,
  formatStoreDate,
  formatStoreDateTime,
  storeDateTimeSettingsFromCompanyBundle,
  type StoreDateTimeSettings,
} from "./store-date-time.ts";

const melbourne: StoreDateTimeSettings = {
  timezone: "Australia/Melbourne",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "HH:mm:ss",
};

test("uses Melbourne when store date-time settings are unavailable", () => {
  assert.equal(DEFAULT_STORE_DATE_TIME.timezone, "Australia/Melbourne");
});

test("reads store date-time values from the company settings bundle", () => {
  const settings = storeDateTimeSettingsFromCompanyBundle({
    "company.timezone": { value: "Australia/Melbourne" },
    "company.date_format": { value: "YYYY-MM-DD" },
    "company.time_format": { value: "HH:mm:ss" },
  });

  assert.deepEqual(settings, {
    timezone: "Australia/Melbourne",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "HH:mm:ss",
  });
});

test("formats an instant in the configured store timezone and seconds format", () => {
  assert.equal(formatStoreDateTime("2026-11-18T13:04:05Z", melbourne), "19/11/2026 00:04:05");
});

test("keeps a business-date value on its stated date", () => {
  assert.equal(formatStoreDate("2026-11-19", melbourne), "19/11/2026");
});

test("supports the configured 12-hour format", () => {
  assert.equal(formatStoreDateTime("2026-11-18T13:04:05Z", {
    ...melbourne,
    timeFormat: "hh:mm a",
  }), "19/11/2026 12:04 AM");
});

test("supports year-first date format", () => {
  assert.equal(formatStoreDate("2026-11-19", {
    ...melbourne,
    dateFormat: "YYYY-MM-DD",
  }), "2026-11-19");
});

test("falls back safely when stored date or timezone values are invalid", () => {
  assert.equal(formatStoreDate("2026-11-19", {
    ...melbourne,
    dateFormat: "INVALID",
    timezone: "Mars/Phobos",
  }), "19/11/2026");
});
