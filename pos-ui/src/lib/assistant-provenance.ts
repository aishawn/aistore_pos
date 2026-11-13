type ReportRow = Record<string, unknown>;

export interface AssistantProvenanceMetadata {
  source?: string | null;
  dataSource?: string | null;
  dataAsOf?: string | null;
  storeScope?: string | null;
  reportPeriodFrom?: string | null;
  reportPeriodTo?: string | null;
  reportTimeZone?: string | null;
  reportDataStatus?: string | null;
}

const MONTHS = new Map([
  ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"],
  ["may", "05"], ["jun", "06"], ["jul", "07"], ["aug", "08"],
  ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
]);

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function reportDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const localized = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec(text);
  if (!localized) return null;
  const month = MONTHS.get(localized[2].toLowerCase());
  return month ? validIsoDate(Number(localized[3]), Number(month), Number(localized[1])) : null;
}

export function assistantRouteLabel(source: string | null | undefined): string | null {
  if (source === "deterministic") return "Rule-based route";
  if (source === "llm") return "AI-classified route";
  return source?.trim() || null;
}

export function latestReportDataDate(rows: ReportRow[] | null | undefined): string | null {
  const dates = (rows ?? [])
    .map((row) => reportDate(row.date ?? row.Date))
    .filter((date): date is string => date !== null)
    .sort();
  return dates.at(-1) ?? null;
}

export function returnedReportDateRange(rows: ReportRow[] | null | undefined): string | null {
  const dates = (rows ?? [])
    .map((row) => reportDate(row.date ?? row.Date))
    .filter((date): date is string => date !== null)
    .sort();
  if (!dates.length) return null;
  return dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
}

export function assistantReturnedSalesDateSummary(
  rows: ReportRow[] | null | undefined,
  chinese: boolean,
): string {
  const range = returnedReportDateRange(rows);
  if (range) {
    const latest = latestReportDataDate(rows);
    return chinese
      ? `返回行日期范围：${range} · 最新返回销售日：${latest}`
      : `Rows span: ${range} · Latest returned sales date: ${latest}`;
  }
  if (!rows?.length) return chinese ? "没有返回销售行" : "No sales rows returned";
  return chinese
    ? "已返回销售数据，但没有可识别的逐日日期"
    : "Sales data was returned without readable daily dates";
}

export function requestedSalesDateRange(
  intent: string | null | undefined,
  slots: Record<string, unknown> | null | undefined,
): string | null {
  if (intent !== "report_sales") return null;
  const from = reportDate(slots?.from);
  const to = reportDate(slots?.to);
  if (!from) return to;
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

export function assistantReportDateRange(fromValue: unknown, toValue: unknown): string | null {
  const from = reportDate(fromValue);
  const to = reportDate(toValue);
  if (!from) return null;
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

export function assistantDataAsOf(
  dataAsOf: string | null | undefined,
): string | null {
  return dataAsOf || null;
}

export function assistantProvenanceFields(metadata: AssistantProvenanceMetadata) {
  return {
    source: metadata.source ?? null,
    dataSource: metadata.dataSource ?? null,
    dataAsOf: assistantDataAsOf(metadata.dataAsOf),
    storeScope: metadata.storeScope ?? null,
    reportPeriodFrom: metadata.reportPeriodFrom ?? null,
    reportPeriodTo: metadata.reportPeriodTo ?? null,
    reportTimeZone: metadata.reportTimeZone ?? null,
    reportDataStatus: metadata.reportDataStatus ?? null,
    reportPeriodRange: assistantReportDateRange(metadata.reportPeriodFrom, metadata.reportPeriodTo),
  };
}

export function assistantReportDataStatus(
  status: string | null | undefined,
  chinese: boolean,
): string | null {
  if (!status?.trim()) return null;
  const labels: Record<string, [string, string]> = {
    available: ["Available", "可用"],
    no_data: ["No data", "无数据"],
    unavailable: ["Unavailable", "暂不可用"],
    incomplete: ["Incomplete", "数据不完整"],
  };
  return labels[status.trim().toLowerCase()]?.[chinese ? 1 : 0] ?? status;
}

export function assistantCardDisplayStatus(
  reportDataStatus: string | null | undefined,
  cardStatus: string | null | undefined,
  chinese: boolean,
): { tone: "ready" | "empty" | "partial" | "unavailable"; label: string } {
  const reportStatus = reportDataStatus?.trim().toLowerCase();
  const states: Record<string, { tone: "ready" | "empty" | "partial" | "unavailable"; rank: number }> = {
    available: { tone: "ready", rank: 0 },
    ready: { tone: "ready", rank: 0 },
    no_data: { tone: "empty", rank: 1 },
    incomplete: { tone: "partial", rank: 2 },
    unavailable: { tone: "unavailable", rank: 3 },
  };
  const fallback = cardStatus?.trim().toLowerCase();
  const cardKey = fallback === "empty" ? "no_data"
    : fallback === "partial" ? "incomplete" : fallback;
  const unknownState = { tone: "partial" as const, rank: 2 };
  const reportState = reportStatus ? states[reportStatus] ?? unknownState : undefined;
  const cardState = cardKey ? states[cardKey] ?? unknownState : undefined;
  const reportStateWins = Boolean(reportState && (!cardState || reportState.rank >= cardState.rank));
  const selected = reportState && cardState
    ? reportStateWins ? reportState : cardState
    : reportState ?? cardState ?? unknownState;
  const labels: Record<typeof selected.tone, string> = {
    ready: chinese ? "可用" : "Ready",
    empty: chinese ? "暂无建议" : "No suggestions",
    partial: chinese ? "部分数据需复核" : "Review needed",
    unavailable: chinese ? "暂不可用" : "Unavailable",
  };
  const statusMissing = !reportStatus && !cardKey;
  return {
    tone: selected.tone,
    label: reportStateWins && reportStatus
      ? states[reportStatus]
        ? assistantReportDataStatus(reportStatus, chinese) ?? labels[selected.tone]
        : chinese ? `未知数据状态：${reportDataStatus}` : `Unknown data status: ${reportDataStatus}`
      : !states[cardKey ?? ""] && cardKey
        ? chinese ? `未知卡片状态：${cardStatus}` : `Unknown card status: ${cardStatus}`
        : statusMissing
          ? chinese ? "状态未提供" : "Status not provided"
          : labels[selected.tone],
  };
}

export function formatAssistantDataAsOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

export function assistantDataTimestampLabel(
  value: string | null | undefined,
  chinese: boolean,
): string {
  return value
    ? formatAssistantDataAsOf(value)
    : chinese ? "数据时间未提供" : "Data timestamp unavailable";
}
