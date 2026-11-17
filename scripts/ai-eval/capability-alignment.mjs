export function parseSeedIntents(sql) {
  const start = sql.indexOf("INSERT INTO `ai_intent`");
  const end = start < 0 ? -1 : sql.indexOf("-- ai_slot", start);
  const block = start < 0 ? "" : sql.slice(start, end < 0 ? sql.length : end);
  const codes = new Set();
  for (const line of block.split(/\r?\n/)) {
    const match = /^\('([a-z_]+)'/.exec(line.trim());
    if (match) codes.add(match[1]);
  }
  return [...codes].sort();
}

export function compareIntentCodes(expectedCodes, actualCodes) {
  const expected = [...new Set(expectedCodes)].sort();
  const actual = [...new Set(actualCodes)].sort();
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((code) => !actualSet.has(code));
  const extra = actual.filter((code) => !expectedSet.has(code));
  return { missing, extra, matches: missing.length === 0 && extra.length === 0 };
}
