import { test } from "node:test";
import assert from "node:assert/strict";
import { isExpiryReviewQuestion, looksLikeAssistantWriteCommand } from "./assistant-command-routing.ts";

test("read-only replenishment questions do not enter the command parser", () => {
  for (const question of [
    "Show replenishment suggestions with results",
    "Show replenishment suggestions with no results",
    "Retry replenishment suggestions after a service error",
    "What should I restock?",
    "哪些商品需要补货",
    "展示补货建议",
  ]) assert.equal(looksLikeAssistantWriteCommand(question), false, question);
});

test("explicit replenishment writes and other edits still enter command preview", () => {
  for (const question of [
    "Restock beer to 30",
    "把红酒补货到 12",
    "Update product price to 20",
    "Change customer phone to 0412000000",
  ]) assert.equal(looksLikeAssistantWriteCommand(question), true, question);
});

test("expiry review recognises scoped English and Chinese questions", () => {
  for (const question of ["Which batches are expiring soon?", "Open expiry review.", "哪些批次快到期？", "查看临期商品"]) {
    assert.equal(isExpiryReviewQuestion(question), true, question);
  }
  for (const question of ["Update the expiry date", "Which contracts are expiring soon?", "查询库存 苹果"]) {
    assert.equal(isExpiryReviewQuestion(question), false, question);
  }
});
