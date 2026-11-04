import assert from "node:assert/strict";
import test from "node:test";
import { readJsonApiResponse } from "./json-api-response.ts";

test("reads JSON API responses", async () => {
  const response = new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  assert.deepEqual(await readJsonApiResponse<{ ok: boolean }>(response, "Report request"), { ok: true });
});

test("reports HTML proxy errors without leaking the response body", async () => {
  const response = new Response("<!DOCTYPE html><h1>Bad Gateway</h1>", {
    status: 502,
    headers: { "content-type": "text/html", "x-correlation-id": "req-123" },
  });
  await assert.rejects(readJsonApiResponse(response, "Margin request"), /HTML error page \(HTTP 502\).*req-123/);
  const noRequestId = new Response("<h1>Bad</h1>", { headers: { "content-type": "text/html" } });
  await assert.rejects(readJsonApiResponse(noRequestId, "Margin request"), error => {
    assert.equal(error instanceof Error, true);
    assert.doesNotMatch((error as Error).message, /<h1>/);
    return true;
  });
});
