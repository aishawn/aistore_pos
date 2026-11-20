const PERIODS = new Set([
  "current_month",
  "last_7_days",
  "current_week",
  "previous_week",
  "previous_month",
]);

function parseBusinessDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("INVALID_BUSINESS_DATE");
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("INVALID_BUSINESS_DATE");
  }
  return date;
}

function dateText(date) {
  return date.toISOString().slice(0, 10);
}

export function melbourneBusinessDate(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("INVALID_INSTANT");
  }
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function resolveDynamicReportPeriod(period, today) {
  const current = parseBusinessDate(today);
  const startOfMonth = `${today.slice(0, 7)}-01`;
  if (period === "current_month") return { from: startOfMonth, to: today };

  if (period === "last_7_days") {
    current.setUTCDate(current.getUTCDate() - 6);
    return { from: dateText(current), to: today };
  }

  if (period === "current_week" || period === "previous_week") {
    const daysSinceMonday = (current.getUTCDay() + 6) % 7;
    current.setUTCDate(current.getUTCDate() - daysSinceMonday);
    if (period === "current_week") return { from: dateText(current), to: today };
    current.setUTCDate(current.getUTCDate() - 7);
    const from = dateText(current);
    current.setUTCDate(current.getUTCDate() + 6);
    return { from, to: dateText(current) };
  }

  if (period === "previous_month") {
    current.setUTCDate(1);
    current.setUTCDate(0);
    const to = dateText(current);
    return { from: `${to.slice(0, 7)}-01`, to };
  }

  throw new Error("UNSUPPORTED_REPORT_PERIOD");
}

export function parseDynamicReportFixtures(contents) {
  if (typeof contents !== "string") throw new Error("INVALID_REPORT_FIXTURE");
  const ids = new Set();
  const lines = contents.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) throw new Error("EMPTY_DYNAMIC_REPORT_FIXTURES");
  return lines.map((line, index) => {
    let testCase;
    try {
      testCase = JSON.parse(line);
    } catch {
      throw new Error(`INVALID_REPORT_FIXTURE_LINE_${index + 1}`);
    }
    const expected = testCase?.expected;
    if (typeof testCase?.id !== "string" || !testCase.id.trim()
        || typeof testCase.question !== "string" || !testCase.question.trim()
        || !["report_sales", "report_aov"].includes(expected?.intent)
        || expected?.metric !== (expected.intent === "report_aov" ? "aov" : "sales")
        || !PERIODS.has(expected?.period)) {
      throw new Error(`INVALID_REPORT_FIXTURE_LINE_${index + 1}`);
    }
    if (ids.has(testCase.id)) throw new Error("DUPLICATE_REPORT_CASE_ID");
    ids.add(testCase.id);
    return testCase;
  });
}
