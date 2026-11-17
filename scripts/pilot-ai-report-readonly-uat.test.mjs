import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const entryPath = new URL("./pilot-ai-report-readonly-uat.mjs", import.meta.url);
const entrySource = fs.readFileSync(entryPath, "utf8");

test("report readonly UAT entry delegates to the Orithos-native suite", () => {
  assert.match(entrySource, /import\s+["']\.\/pilot-ai-report-readonly-orithos-uat\.mjs["']/);
  assert.doesNotMatch(entrySource, /\/api\/(?:odoo|shopfront)/i);
});
