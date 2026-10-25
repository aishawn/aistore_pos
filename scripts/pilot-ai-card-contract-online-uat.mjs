import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
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
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const cases = [
  { id: "product-count", question: "How many products do we have?", type: "product_count", route: "/products", answerPattern: /\b(?:has|have)\s+\d+\s+(?:sellable\s+)?products?\b/i },
  { id: "product-count-zh", question: "商品总数", type: "product_count", route: "/products", answerPattern: /(?:(?:has|have)\s+\d+\s+(?:sellable\s+)?products?|\d+\s*(?:个|种)?\s*(?:可售|可销售|在售)?\s*(?:商品|产品)|(?:商品|产品)(?:总数|数量)?\D{0,12}\d+)/i },
  { id: "replenishment", question: "What should I restock?", type: "replenishment", route: "/stock/replenishment" },
  { id: "replenishment-zh", question: "给我补货建议", type: "replenishment", route: "/stock/replenishment" },
  { id: "pricing", question: "Which prices should I review?", type: "pricing", route: "/stock/capped-pricing" },
  { id: "pricing-zh", question: "哪些价格需要复核", type: "pricing", route: "/stock/capped-pricing" },
  { id: "sommelier", question: "Recommend a red wine under $30", type: "sommelier", route: "/sommelier" },
  { id: "sommelier-zh", question: "推荐一款红酒", type: "sommelier", route: "/sommelier" },
  { id: "grocery-recommendation", question: "Recommend beer for a BBQ under $20", type: "recommend", route: "/recommend/grocery" },
  { id: "grocery-recommendation-zh", question: "推荐啤酒", type: "recommend", route: "/recommend/grocery" },
  { id: "guided-customer", question: "Create a customer", type: "guided_action", route: "/customers" },
  { id: "guided-customer-create-zh", question: "创建一个客户", type: "guided_action", route: "/customers" },
  { id: "guided-product-edit", question: "编辑这个产品", type: "guided_action", route: "/products" },
  { id: "guided-product-create-zh", question: "创建一个产品", type: "guided_action", route: "/products" },
  { id: "guided-receive", question: "Receive this stock", type: "guided_action", route: "/stock/replenishment" },
  { id: "guided-invoice-receive", question: "Receive this supplier invoice", type: "guided_action", route: "/invoices" },
  { id: "guided-invoice-submit-zh", question: "提交这张发票", type: "guided_action", route: "/invoices" },
  { id: "guided-price-save", question: "保存这些价格", type: "guided_action", route: "/stock/capped-pricing" },
  { id: "guided-classification-create", question: "Create a classification", type: "guided_action", route: "/classifications" },
  { id: "guided-classification-create-zh", question: "创建分类", type: "guided_action", route: "/classifications" },
  { id: "guided-customer-group-edit", question: "编辑客户分组", type: "guided_action", route: "/customer-groups" },
  { id: "guided-price-list-create", question: "Create a price list", type: "guided_action", route: "/pricelists" },
  { id: "guided-price-list-create-zh", question: "创建价目表", type: "guided_action", route: "/pricelists" },
  { id: "guided-gift-card-delete", question: "Delete a gift card", type: "guided_action", route: "/giftcards" },
  { id: "guided-gift-card-delete-zh", question: "删除礼品卡", type: "guided_action", route: "/giftcards" },
  { id: "guided-stocktake-confirm", question: "确认库存盘点", type: "guided_action", route: "/stocktake" },
  { id: "guided-buying-period-update", question: "Update buying period", type: "guided_action", route: "/stock/buying-periods" },
  { id: "guided-buying-period-update-zh", question: "更新采购周期", type: "guided_action", route: "/stock/buying-periods" },
  { id: "guided-customer-balance-edit", question: "Edit customer balance", type: "guided_action", route: "/customers/balances" },
  { id: "guided-customer-balance-edit-zh", question: "编辑客户余额", type: "guided_action", route: "/customers/balances" },
];

const titles = {
  en: {
    product_count: "Product catalogue",
    replenishment: "Replenishment suggestions",
    pricing: "Price review suggestions",
    sommelier: "Wine recommendations",
    recommend: "Grocery recommendations",
    guided_action: "Action guide",
  },
  zh: {
    product_count: "商品目录",
    replenishment: "补货建议",
    pricing: "价格复核建议",
    sommelier: "品鉴推荐",
    recommend: "商品推荐",
    guided_action: "操作指引",
  },
};
const ctaLabels = {
  en: {
    "/products": "Open products",
    "/stock/replenishment": "Open replenishment",
    "/stock/capped-pricing": "Open price review",
    "/sommelier": "Open Sommelier",
    "/recommend/grocery": "Open grocery recommendations",
    "/customers": "Open customers",
    "/invoices": "Open supplier invoices",
    "/classifications": "Open classifications",
    "/customer-groups": "Open customer groups",
    "/pricelists": "Open price lists",
    "/giftcards": "Open gift cards",
    "/stocktake": "Open stocktake",
    "/stock/buying-periods": "Open buying periods",
    "/customers/balances": "Open customer balances",
  },
  zh: {
    "/products": "打开商品目录",
    "/stock/replenishment": "打开补货建议",
    "/stock/capped-pricing": "打开价格复核",
    "/sommelier": "打开品鉴推荐",
    "/recommend/grocery": "打开商品推荐",
    "/customers": "打开客户页面",
    "/invoices": "打开供应商发票",
    "/classifications": "打开商品分类",
    "/customer-groups": "打开客户分组",
    "/pricelists": "打开价目表",
    "/giftcards": "打开礼品卡",
    "/stocktake": "打开库存盘点",
    "/stock/buying-periods": "打开采购周期",
    "/customers/balances": "打开客户余额",
  },
};
for (const item of cases) {
  const language = /[\u3400-\u9fff]/.test(item.question) ? "zh" : "en";
  if (!titles[language][item.type] || !ctaLabels[language][item.route]) {
    throw new Error(`CARD_CONTRACT_EXPECTATION_MISSING_${item.id}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const checks = [];
let runtime = {};
try {
  runtime = await context.request.get(`${base}/api/public/version`).then((response) => response.json());
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const item of cases) {
    const response = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question: item.question, surface: "sell" },
      headers: { Origin: base },
      timeout: 120000,
    });
    const body = await response.json().catch(() => ({}));
    const data = body.data ?? {};
    const cards = Array.isArray(data.cards) ? data.cards : [];
    const card = cards.find((candidate) => candidate?.type === item.type);
    const language = /[\u3400-\u9fff]/.test(item.question) ? "zh" : "en";
    const expectedTitle = titles[language][item.type];
    const expectedCtaLabel = ctaLabels[language][item.route];
    const passed = response.ok()
      && body.code === 0
      && Boolean(card)
      && card.status !== "unavailable"
      && card.ctaRoute === item.route
      && card.cta?.route === item.route
      && typeof card.cta?.label === "string"
      && card.cta?.label === card.ctaLabel
      && card.title === expectedTitle
      && card.cta?.label === expectedCtaLabel
      && (!item.answerPattern || item.answerPattern.test(String(data.answer ?? "")))
      && Array.isArray(data.writeRequests)
      && data.writeRequests.length === 0;
    checks.push({
      id: item.id,
      question: item.question,
      status: passed ? "PASS" : "FAIL",
      httpStatus: response.status(),
      intent: data.intent ?? null,
      cardPresent: Boolean(card),
      cardStatus: card?.status ?? null,
      ctaRouteMatches: card?.ctaRoute === item.route && card?.cta?.route === item.route,
      ctaLabelMatches: typeof card?.cta?.label === "string" && card.cta.label === card.ctaLabel,
      titleMatches: card?.title === expectedTitle,
      localizedCtaMatches: card?.cta?.label === expectedCtaLabel,
      expectedTitle,
      actualTitle: card?.title ?? null,
      expectedCtaLabel,
      actualCtaLabel: card?.cta?.label ?? card?.ctaLabel ?? null,
      answerMatches: !item.answerPattern || item.answerPattern.test(String(data.answer ?? "")),
      writeRequestCount: Array.isArray(data.writeRequests) ? data.writeRequests.length : null,
      actualCards: cards.map((candidate) => ({
        type: candidate?.type ?? null,
        title: candidate?.title ?? null,
        status: candidate?.status ?? null,
        route: candidate?.cta?.route ?? candidate?.ctaRoute ?? null,
        label: candidate?.cta?.label ?? candidate?.ctaLabel ?? null,
      })),
    });
  }
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  worktreeDirty: execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    encoding: "utf8",
  }).trim().length > 0,
  runtimeCommit: runtime.frontend?.commit === runtime.backend?.commit ? runtime.backend.commit : null,
  runtimeIdentity: {
    frontendCommit: runtime.frontend?.commit ?? null,
    backendCommit: runtime.backend?.commit ?? null,
    matchesSourceCommit: runtime.frontend?.commit === sourceCommit && runtime.backend?.commit === sourceCommit,
  },
  target: base,
  scope: "authenticated assistant API-only card contract; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  writeRequests: ["none: assistant API only"],
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_CARD_CONTRACT_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, runtimeCommit: output.runtimeCommit, worktreeDirty: output.worktreeDirty }));
if (output.failed) process.exitCode = 1;
