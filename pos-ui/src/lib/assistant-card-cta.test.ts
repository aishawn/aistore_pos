import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAssistantHref, resolveAssistantCardCta } from "./assistant-card-cta.ts";

test("replaces a generic workflow label with its destination on the wine card", () => {
  assert.deepEqual(resolveAssistantCardCta({
    type: "sommelier",
    title: "Wine recommendations",
    ctaLabel: "Open workflow",
    ctaRoute: "/sommelier",
  }), {
    label: "Open wine recommendations",
    href: "/sommelier",
  });
});

test("maps generic workflow labels to every supported directory destination", () => {
  const expected = new Map([
    ["/classifications", "Open classifications"],
    ["/customer-groups", "Open customer groups"],
    ["/customers/balances", "Open customer balances"],
    ["/giftcards", "Open gift cards"],
    ["/pricelists", "Open price lists"],
    ["/stock/bulk-price-edit", "Open bulk price review"],
    ["/stock/buying-periods", "Open buying periods"],
    ["/stocktake", "Open stocktake"],
  ]);

  for (const [href, label] of expected) {
    assert.deepEqual(resolveAssistantCardCta({
      type: "guided_action",
      title: "Continue",
      ctaLabel: "Open workflow",
      ctaRoute: href,
    }), { label, href }, href);
  }
});

test("keeps a specific server-provided action label", () => {
  assert.deepEqual(resolveAssistantCardCta({
    type: "pricing",
    title: "Price review suggestions",
    cta: { label: "Review prices", route: "/stock/capped-pricing" },
    ctaLabel: "Open workflow",
    ctaRoute: "/stock/capped-pricing",
  }), {
    label: "Review prices",
    href: "/stock/capped-pricing",
  });
});

test("does not invent a link when the card has no route", () => {
  assert.equal(resolveAssistantCardCta({
    type: "sommelier",
    title: "Wine recommendations",
    ctaLabel: "Open workflow",
  }), null);
});

test("keeps safe internal routes with query and hash", () => {
  assert.equal(normalizeAssistantHref(" /stock/list?search=beer#results "), "/stock/list?search=beer#results");
});

test("routes assistant product and customer links to Odoo source-of-truth pages", () => {
  assert.equal(normalizeAssistantHref("/products"), "/products/odoo");
  assert.equal(normalizeAssistantHref("/products?q=shiraz#results"), "/products/odoo?q=shiraz#results");
  assert.equal(normalizeAssistantHref("/customers"), "/customers/odoo");
  assert.equal(normalizeAssistantHref("/customers?query=retailer"), "/customers/odoo?query=retailer");
});

test("rejects external, protocol-relative, and ambiguous routes", () => {
  for (const href of [
    "https://example.com",
    "//example.com/path",
    "/\\\\example.com/path",
    "/%2f%2fexample.com/path",
    "/stock/\nlist",
  ]) {
    assert.equal(normalizeAssistantHref(href), null, href);
  }
});

test("rejects privileged or API destinations from assistant cards", () => {
  for (const href of [
    "/admin",
    "/platform/users",
    "/internal/debug",
    "/debug/trace",
    "/api/ai/config/client",
    "/%61dmin/users",
    "/%2561dmin/users",
    "/%70latform/settings",
    "/ADMIN/users",
  ]) {
    assert.equal(normalizeAssistantHref(href), null, href);
  }
});

test("does not render a card CTA with an external destination", () => {
  assert.equal(resolveAssistantCardCta({
    type: "guided_action",
    title: "Continue",
    cta: { label: "Open workflow", route: "https://example.com" },
  }), null);
});
