import { test } from "node:test";
import assert from "node:assert/strict";
import { isPurchaseDraftEnabled } from "./purchase-draft-policy.ts";

test("draft RFQs stay disabled unless both the feature and host allowlist are enabled", () => {
  const oldEnabled = process.env.AI_PURCHASE_DRAFT_ENABLED;
  const oldHosts = process.env.AI_PURCHASE_DRAFT_ALLOWED_HOSTS;
  try {
    process.env.AI_PURCHASE_DRAFT_ENABLED = "true";
    process.env.AI_PURCHASE_DRAFT_ALLOWED_HOSTS = "demo.orithos.com.au";
    assert.equal(isPurchaseDraftEnabled("demo.orithos.com.au"), true);
    assert.equal(isPurchaseDraftEnabled("demo.orithos.com.au."), true);
    assert.equal(isPurchaseDraftEnabled("skr.orithos.com.au"), false);
    assert.equal(isPurchaseDraftEnabled("evil.example"), false);
    process.env.AI_PURCHASE_DRAFT_ENABLED = "false";
    assert.equal(isPurchaseDraftEnabled("demo.orithos.com.au"), false);
  } finally {
    if (oldEnabled === undefined) delete process.env.AI_PURCHASE_DRAFT_ENABLED; else process.env.AI_PURCHASE_DRAFT_ENABLED = oldEnabled;
    if (oldHosts === undefined) delete process.env.AI_PURCHASE_DRAFT_ALLOWED_HOSTS; else process.env.AI_PURCHASE_DRAFT_ALLOWED_HOSTS = oldHosts;
  }
});
