import assert from "node:assert/strict";
import test from "node:test";
import { calculateDeadStock } from "./dead-stock-data.ts";
import type { ReportRpc } from "./report-data.ts";

test("dead-stock report uses the AI company/shared-product and completed-sale contract", async () => {
  const calls: Array<{ model: string; method: string; args: unknown[]; kwargs?: Record<string, unknown> }> = [];
  const rpc: ReportRpc = async <T>(
    _sessionId: string,
    model: string,
    method: string,
    args: unknown[],
    kwargs?: Record<string, unknown>,
  ) => {
    calls.push({ model, method, args, kwargs });
    if (model === "product.product" && method === "search_count") return 1 as T;
    if (model === "product.product" && method === "search_read") {
      return [{
        id: 501,
        display_name: "VB Cans",
        qty_available: 12,
        free_qty: 4,
        standard_price: 2,
        default_code: "VB-12",
        categ_id: [3, "Beer"],
      }] as T;
    }
    if (model === "pos.order.line" && method === "read_group") return [] as T;
    throw new Error(`Unexpected Odoo call ${model}.${method}`);
  };

  const result = await calculateDeadStock(
    rpc,
    "session",
    7,
    null,
    new Date("2026-11-05T00:00:00Z"),
    "2026-11-01T00:00:00Z",
  );

  const productRead = calls.find((call) => call.model === "product.product" && call.method === "search_read");
  assert.deepEqual(productRead?.args[0], [
    ["active", "=", true],
    "|",
    ["company_id", "=", false],
    ["company_id", "=", 7],
    ["id", ">", 0],
  ]);
  assert.deepEqual(productRead?.kwargs?.fields, [
    "id", "display_name", "default_code", "qty_available", "standard_price", "categ_id",
  ]);

  const salesCalls = calls.filter((call) => call.model === "pos.order.line");
  assert.equal(salesCalls.length, 3);
  for (const call of salesCalls) {
    const domain = call.args[0] as unknown[];
    assert.ok(domain.some((term) => JSON.stringify(term) === JSON.stringify(["order_id.amount_total", ">", 0])));
    assert.ok(domain.some((term) => JSON.stringify(term) === JSON.stringify(["order_id.is_refund", "=", false])));
    const seedExclusionIndex = domain.indexOf("!");
    assert.deepEqual(domain.slice(seedExclusionIndex, seedExclusionIndex + 2), [
      "!", ["order_id.uuid", "=like", "demo-seed-7-%"],
    ]);
  }

  assert.equal(result.products[0]?.onHand, 12);
  assert.equal(result.products[0]?.inventoryValue, 24);
  assert.deepEqual(result.writeRequests, []);
});
