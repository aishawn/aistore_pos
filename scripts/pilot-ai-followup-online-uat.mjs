import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME || "admin";
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

function shiftIsoDate(value, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
const record = (id, status, evidence) => checks.push({ id, status, evidence });
const sourceCommit = process.env.PILOT_SOURCE_COMMIT?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const workingTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--", "pos-api"], {
  cwd: root,
  encoding: "utf8",
}).trim()) || Boolean(execFileSync("git", ["diff", "--name-only", sourceCommit, "HEAD", "--", "pos-api"], {
  cwd: root,
  encoding: "utf8",
}).trim());
let runtimeCommit = null;
try {
  const version = await context.request.get(`${base}/api/public/version`, { timeout: 30000 });
  const versionBody = await version.json().catch(() => ({}));
  runtimeCommit = versionBody.backend?.commit ?? null;
  const matchesSourceCommit = typeof runtimeCommit === "string" && runtimeCommit === sourceCommit && !workingTreeDirty;
  record("runtime-identity", matchesSourceCommit ? "PASS" : "BLOCKED", {
    httpStatus: version.status(),
    runtimeCommit,
    sourceCommit,
    workingTreeDirty,
    matchesSourceCommit,
  });

  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const sample of [
    { id: "en", question: "sales last 7 days", followUp: "and yesterday?", surface: "sell", kind: "sales" },
    { id: "en-previous-day", question: "sales yesterday", followUp: "and the day before?", surface: "reports", kind: "sales", expectPreviousDay: true },
    { id: "zh", question: "近7天销售额", followUp: "那昨天呢", surface: "reports", kind: "sales" },
    { id: "stock-en", question: "current stock for Shiraz", followUp: "and yesterday?", repeatFollowUp: "and the day before?", surface: "stock", kind: "stock-history" },
    { id: "stock-zh", question: "西拉现在有多少库存", followUp: "那昨天呢", repeatFollowUp: "那前一天呢", surface: "stock", kind: "stock-history" },
  ]) {
    const seed = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: sample.question, surface: sample.surface },
      headers: { Origin: base },
      timeout: 120000,
    });
    const seedBody = await seed.json().catch(() => ({}));
    const seedData = seedBody.data ?? {};
    const threadId = typeof seedData.threadId === "string" ? seedData.threadId : null;
    const seedIntent = sample.kind === "stock-history" ? "report_stock" : "report_sales";
    const seedOk = seed.ok() && seedBody.code === 0 && threadId
      && seedData.intent === seedIntent
      && Array.isArray(seedData.writeRequests) && seedData.writeRequests.length === 0;
    record(`${sample.id}-seed`, seedOk ? "PASS" : "FAIL", {
      httpStatus: seed.status(),
      intent: seedData.intent ?? null,
      threadIdPresent: Boolean(threadId),
      writeRequests: seedData.writeRequests ?? null,
    });
    if (!seedOk) continue;

    const threadsResponse = await context.request.get(`${base}/api/ai/threads`, {
      headers: { Origin: base },
      timeout: 60000,
    });
    const threadsBody = await threadsResponse.json().catch(() => ({}));
    const thread = (Array.isArray(threadsBody.data) ? threadsBody.data : [])
      .find((row) => row.sessionKey === threadId);
    const historyResponse = thread
      ? await context.request.get(`${base}/api/ai/threads/${encodeURIComponent(thread.id)}`, {
        headers: { Origin: base },
        timeout: 60000,
      })
      : null;
    const historyBody = historyResponse ? await historyResponse.json().catch(() => ({})) : {};
    const messages = Array.isArray(historyBody.data?.messages) ? historyBody.data.messages : [];
    const reopened = threadsResponse.ok() && threadsBody.code === 0 && historyResponse?.ok()
      && historyBody.code === 0
      && messages.some((message) => message.role === "user" && message.text === sample.question);
    record(`${sample.id}-history-open`, reopened ? "PASS" : "FAIL", {
      listHttpStatus: threadsResponse.status(),
      detailHttpStatus: historyResponse?.status() ?? null,
      messagesPresent: messages.length > 0,
      seedQuestionRestored: messages.some((message) => message.role === "user" && message.text === sample.question),
    });
    if (!reopened) continue;

    const followUp = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: sample.followUp, threadId, surface: sample.surface },
      headers: { Origin: base },
      timeout: 120000,
    });
    const followUpBody = await followUp.json().catch(() => ({}));
    const followUpData = followUpBody.data ?? {};
    const slots = followUpData.slots ?? {};
    const singleDayRange = /^\d{4}-\d{2}-\d{2}$/.test(String(slots.from ?? ""))
      && slots.from === slots.to && String(slots.days ?? "") === "1";
    const staleDaysCleared = String(slots.days ?? "") === "1"
      && String(seedData.slots?.days ?? "") !== String(slots.days);
    const previousDayMatches = !sample.expectPreviousDay
      || (slots.from === shiftIsoDate(seedData.slots?.from, -1) && slots.to === slots.from);
    const retainedFilters = ["category", "query"]
      .filter((key) => typeof seedData.slots?.[key] === "string" && seedData.slots[key].trim())
      .every((key) => slots[key] === seedData.slots[key]);
    const answer = String(followUpData.answer ?? "");
    let followUpOk;
    let followUpEvidence;
    if (sample.kind === "stock-history") {
      const cards = Array.isArray(followUpData.cards) ? followUpData.cards : [];
      const card = cards.find((item) => item.type === "stock_history");
      const noFabricatedStock = !followUpData.table
        && Array.isArray(card?.items) && card.items.length === 0
        && !/\b\d+\s*(?:units?|items?|bottles?)\b/i.test(answer)
        && !/(?:库存|现有|剩余)\s*\d+|\d+\s*(?:件|瓶|个)/.test(answer);
      followUpOk = followUp.ok() && followUpBody.code === 0
        && followUpData.threadId === threadId
        && followUpData.intent === "stock_history_unavailable"
        && followUpData.fastPathId === "historical_stock_unavailable"
        && card?.status === "unavailable"
        && (card?.ctaRoute ?? card?.routeTarget ?? card?.cta?.route) === "/stock/list"
        && noFabricatedStock
        && Array.isArray(followUpData.writeRequests) && followUpData.writeRequests.length === 0;
      followUpEvidence = {
        httpStatus: followUp.status(),
        intent: followUpData.intent ?? null,
        fastPathId: followUpData.fastPathId ?? null,
        sameThread: followUpData.threadId === threadId,
        cardType: card?.type ?? null,
        cardStatus: card?.status ?? null,
        cardRoute: card?.ctaRoute ?? card?.routeTarget ?? card?.cta?.route ?? null,
        cardItems: Array.isArray(card?.items) ? card.items.length : null,
        noFabricatedStock,
        writeRequests: followUpData.writeRequests ?? null,
      };
    } else {
      followUpOk = followUp.ok() && followUpBody.code === 0
        && followUpData.threadId === threadId
        && followUpData.intent === "report_sales"
        && singleDayRange && retainedFilters && previousDayMatches && answer.length > 0
        && Array.isArray(followUpData.writeRequests) && followUpData.writeRequests.length === 0;
      followUpEvidence = {
        httpStatus: followUp.status(),
        intent: followUpData.intent ?? null,
        sameThread: followUpData.threadId === threadId,
        singleDayRange,
        staleDaysCleared,
        previousDayMatches,
        retainedFilters,
        answerPresent: answer.length > 0,
        writeRequests: followUpData.writeRequests ?? null,
      };
    }
    record(`${sample.id}-followup-after-history-open`, followUpOk ? "PASS" : "FAIL", followUpEvidence);

    if (sample.kind === "stock-history") {
      const reopenedThreadsResponse = await context.request.get(`${base}/api/ai/threads`, {
        headers: { Origin: base },
        timeout: 60000,
      });
      const reopenedThreadsBody = await reopenedThreadsResponse.json().catch(() => ({}));
      const reopenedThread = (Array.isArray(reopenedThreadsBody.data) ? reopenedThreadsBody.data : [])
        .find((row) => row.sessionKey === threadId);
      const reopenedDetailResponse = reopenedThread
        ? await context.request.get(`${base}/api/ai/threads/${encodeURIComponent(reopenedThread.id)}`, {
          headers: { Origin: base },
          timeout: 60000,
        })
        : null;
      const reopenedDetail = reopenedDetailResponse
        ? await reopenedDetailResponse.json().catch(() => ({}))
        : {};
      const reopenedMessages = Array.isArray(reopenedDetail.data?.messages) ? reopenedDetail.data.messages : [];
      const historicalAnswer = [...reopenedMessages].reverse().find((message) =>
        message.role === "assistant" && message.intent === "stock_history_unavailable");
      const historicalCard = Array.isArray(historicalAnswer?.cards)
        ? historicalAnswer.cards.find((item) => item.type === "stock_history")
        : null;
      const historicalCardRestored = reopenedThreadsResponse.ok() && reopenedThreadsBody.code === 0
        && reopenedDetailResponse?.ok() && reopenedDetail.code === 0
        && historicalCard?.status === "unavailable"
        && (historicalCard?.ctaRoute ?? historicalCard?.cta?.route) === "/stock/list"
        && historicalCard?.retryable === false
        && Array.isArray(historicalCard?.items) && historicalCard.items.length === 0;
      record(`${sample.id}-unavailable-card-restored`, historicalCardRestored ? "PASS" : "FAIL", {
        listHttpStatus: reopenedThreadsResponse.status(),
        detailHttpStatus: reopenedDetailResponse?.status() ?? null,
        historicalAnswerPresent: Boolean(historicalAnswer),
        cardType: historicalCard?.type ?? null,
        cardStatus: historicalCard?.status ?? null,
        cardRoute: historicalCard?.ctaRoute ?? historicalCard?.cta?.route ?? null,
        retryable: historicalCard?.retryable ?? null,
        cardItems: Array.isArray(historicalCard?.items) ? historicalCard.items.length : null,
      });

      const repeatedFollowUp = await context.request.post(`${base}/api/ai/assistant`, {
        data: { question: sample.repeatFollowUp, threadId, surface: sample.surface },
        headers: { Origin: base },
        timeout: 120000,
      });
      const repeatedBody = await repeatedFollowUp.json().catch(() => ({}));
      const repeatedData = repeatedBody.data ?? {};
      const repeatedCard = Array.isArray(repeatedData.cards)
        ? repeatedData.cards.find((item) => item.type === "stock_history")
        : null;
      const repeatedOk = repeatedFollowUp.ok() && repeatedBody.code === 0
        && repeatedData.threadId === threadId
        && repeatedData.intent === "stock_history_unavailable"
        && repeatedData.fastPathId === "historical_stock_unavailable"
        && repeatedCard?.status === "unavailable"
        && Array.isArray(repeatedCard?.items) && repeatedCard.items.length === 0
        && !repeatedData.table
        && Array.isArray(repeatedData.writeRequests) && repeatedData.writeRequests.length === 0;
      record(`${sample.id}-repeat-relative-followup-remains-unavailable`, repeatedOk ? "PASS" : "FAIL", {
        httpStatus: repeatedFollowUp.status(),
        intent: repeatedData.intent ?? null,
        fastPathId: repeatedData.fastPathId ?? null,
        cardStatus: repeatedCard?.status ?? null,
        cardItems: Array.isArray(repeatedCard?.items) ? repeatedCard.items.length : null,
        tablePresent: Boolean(repeatedData.table),
        writeRequests: repeatedData.writeRequests ?? null,
      });
    }
  }
} catch (error) {
  record("setup", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  workingTreeDirty,
  runtimeCommit,
  matchesSourceCommit: Boolean(runtimeCommit && runtimeCommit === sourceCommit && !workingTreeDirty),
  target: base,
  scope: "authenticated history-reopen sales and stock follow-ups; assistant API only; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  blocked: checks.filter((check) => check.status === "BLOCKED").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  writeRequests: [],
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_FOLLOWUP_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, blocked: output.blocked, failed: output.failed }));
if (output.failed) process.exitCode = 1;
