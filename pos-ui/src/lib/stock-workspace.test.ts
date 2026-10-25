import assert from "node:assert/strict";
import test from "node:test";
import { parseStocktakeDraft, stocktakeDraftKey } from "./stocktake-draft.ts";
import { getSidebarNavigation } from "./sidebar-navigation.ts";
import { isMobileAllowedHref } from "./ui-mode.ts";

test("stocktake drafts are isolated by tenant, employee, host and location", () => {
  const key = stocktakeDraftKey("demo.localhost", 1, "23", "45");
  assert.notEqual(key, stocktakeDraftKey("other.localhost", 1, "23", "45"));
  assert.notEqual(key, stocktakeDraftKey("demo.localhost", 2, "23", "45"));
  assert.notEqual(key, stocktakeDraftKey("demo.localhost", 1, "24", "45"));
  assert.notEqual(key, stocktakeDraftKey("demo.localhost", 1, "23", "46"));
});

test("draft restore preserves uncertain results and rejects malformed/duplicate/oversized drafts", () => {
  const draft = { version: 1, updatedAt: new Date().toISOString(), uncertain: true, lines: [{ id: 1, expectedQty: 5, countedQty: "3" }] };
  assert.deepEqual(parseStocktakeDraft(JSON.stringify(draft)), draft);
  assert.equal(parseStocktakeDraft("broken"), null);
  assert.equal(parseStocktakeDraft(JSON.stringify({ ...draft, version: 2 })), null);
  assert.equal(parseStocktakeDraft(JSON.stringify({ ...draft, lines: [draft.lines[0], draft.lines[0]] })), null);
  assert.equal(parseStocktakeDraft(JSON.stringify({ ...draft, lines: Array.from({ length: 41 }, (_, i) => ({ ...draft.lines[0], id: i + 1 })) })), null);
});

test("Stock includes price lists and Purchasing is visible with any one of its permissions", () => {
  const admin = getSidebarNavigation({ isAdmin: true });
  const group = admin.find((entry) => entry.label === "Stock");
  assert.ok(group && "items" in group);
  assert.deepEqual(group.items.map((item) => item.label), ["Products", "Price Lists", "Purchasing", "Suppliers"]);
  for (const permission of ["stock.purchases", "stock.replenishment", "stock.invoices"]) {
    const navigation = getSidebarNavigation({ hasPermission: (key) => key === permission });
    const stock = navigation.find((entry) => entry.label === "Stock");
    assert.ok(stock && "items" in stock);
    assert.deepEqual(stock.items.map((item) => item.label), ["Purchasing"]);
  }
  assert.equal(getSidebarNavigation({ hasPermission: () => false }).some((entry) => entry.label === "Stock"), false);
});

test("purchasing tabs and product dialogs remain available in mobile mode", () => {
  for (const href of ["/products?dialog=categories", "/products?dialog=stocktake", "/purchases?tab=replenishment", "/purchases?tab=invoices", "/invoices/new"]) assert.ok(isMobileAllowedHref(href), href);
});
