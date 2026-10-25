import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL || "http://demo.localhost:3035").replace(/\/+$/, "");
const entryRoute = process.env.PILOT_ENTRY_ROUTE || "/customers/odoo";
const pagePresentation = entryRoute === "/assistant";
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH || "docs/UAT_AI_CARD_UI_LOCAL_2026-10-23_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR || "docs/screenshots/2026-10-23-ai-card-ui-local");
const allScenarios = [
  { id: "guided-customer", question: "Create a customer", title: "Action guide", ctaLabel: "Open customer directory", route: "/customers", expectedRoute: "/customers/odoo", summary: "Continue in the customer directory.", structured: true },
  { id: "guided-product-edit", question: "Edit this product", title: "Action guide", ctaLabel: "Open product catalogue", route: "/products", expectedRoute: "/products/odoo", summary: "Continue in the product catalogue.", structured: true },
  { id: "guided-stock-receive", question: "Receive this stock", title: "Action guide", ctaLabel: "Open replenishment", route: "/stock/replenishment", summary: "Continue in the replenishment workflow.", structured: true },
  { id: "guided-price-save", question: "Save these prices", title: "Action guide", ctaLabel: "Open price review", route: "/stock/capped-pricing", summary: "Review these prices before saving.", structured: true },
  { id: "legacy-entity-delete-customer-group", question: "Delete this customer group", title: "Action guide", ctaLabel: "Open customer groups", route: "/customer-groups", expectedRoute: "/customer-groups", suggestedRoute: "/customers", summary: "Continue on the customer group page to review this change.", answer: "Continue on the customer group page to review this change.", intent: "entity_action", slots: { entity: "customer_group", op: "delete", query: "Retail Customers" }, legacyEntityAction: true },
  { id: "legacy-entity-edit-customer-balance", question: "Edit this customer balance", title: "Action guide", ctaLabel: "Open customer balances", route: "/customers/balances", expectedRoute: "/customers/balances", suggestedRoute: "/customers", summary: "Continue on the customer balance page to review this change.", answer: "Continue on the customer balance page to review this change.", intent: "entity_action", slots: { entity: "balance", op: "edit", query: "Fixture Retailer" }, legacyEntityAction: true },
  { id: "legacy-sale-action-customer", question: "Create a customer using the old assistant response", legacySaleAction: true, legacyAction: "Create Customer", intent: "sale_action", answer: "Continue on the customer page to create this record.", answerIncludes: ["Continue on the customer page"], ctaLabel: "Open customers", route: "/customers/odoo", expectedRoute: "/customers/odoo" },
  { id: "report-sales-table", question: "What were sales today?", noCard: true, ctaExpected: false, intent: "report_sales", answer: "Sales today: AUD 125.50", answerIncludes: ["AUD 125.50"], reportId: 501, table: { columns: ["Day", "Sales"], rows: [{ Day: "2026-10-23", Sales: "125.50" }] }, expectedTableIncludes: ["2026-10-23", "125.50"], route: "/overview", expectedRoute: "/overview" },
  { id: "historical-stock-unavailable", question: "and yesterday?", title: "Historical stock", ctaLabel: "Open stock list", route: "/stock/list", summary: "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.", answer: "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.", answerIncludes: ["historical stock is unavailable"], expectedStatus: "Unavailable", retryable: false, structured: true, intent: "stock_history_unavailable", type: "stock_history", status: "unavailable", fastPathId: "historical_stock_unavailable" },
  { id: "historical-stock-unavailable-zh", question: "那昨天呢", title: "历史库存", ctaLabel: "打开库存列表", route: "/stock/list", summary: "历史库存查询暂不可用；当前库存报表是实时快照，不能还原历史库存。请打开库存列表查看当前库存。", answer: "历史库存查询暂不可用；当前库存报表是实时快照，不能还原历史库存。请打开库存列表查看当前库存。", answerIncludes: ["不能还原历史库存"], expectedStatus: "暂不可用", retryable: false, structured: true, intent: "stock_history_unavailable", type: "stock_history", status: "unavailable", fastPathId: "historical_stock_unavailable" },
  { id: "legacy-product-count", question: "How many products do we have?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "This store has 42 sellable products in the catalogue.", answerIncludes: ["42", "sellable products"], expectedStatus: "Ready", structured: false, intent: "product_count" },
  { id: "legacy-product-count-zh-question", question: "商品目录里有多少商品？", title: "商品目录", ctaLabel: "打开商品目录", route: "/products", expectedRoute: "/products/odoo", summary: "This store has 42 sellable products in the catalogue.", answerIncludes: ["42", "sellable products"], expectedStatus: "可用", structured: false, intent: "product_count" },
  { id: "product-count-zh-current", question: "商品总数是多少？", title: "商品目录", ctaLabel: "打开商品目录", route: "/products", expectedRoute: "/products/odoo", summary: "本店商品目录共有 42 个可售商品。", answer: "本店商品目录共有 42 个可售商品。", answerIncludes: ["42 个可售商品"], forbiddenItems: ["打开商品目录查看"], expectedStatus: "可用", structured: false, intent: "product_count" },
  { id: "product-count-empty-zh", question: "请告诉我商品目录里有多少商品？", title: "商品目录", ctaLabel: "打开商品目录", route: "/products", expectedRoute: "/products/odoo", summary: "本店商品目录共有 0 个可售商品。", answer: "本店商品目录共有 0 个可售商品。", answerIncludes: ["0 个可售商品"], forbiddenItems: ["打开商品目录查看"], emptyReason: "当前商品目录中没有可售商品。", expectedStatus: "暂无匹配", structured: true, intent: "product_count", type: "product_count", status: "empty" },
  { id: "product-count-empty", question: "How many products are in the catalogue?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "This store has 0 sellable products in the catalogue.", answerIncludes: ["0 sellable products"], emptyReason: "No sellable products are currently available in the catalogue.", expectedStatus: "No match", structured: true, intent: "product_count", type: "product_count", status: "empty" },
  { id: "product-count-unavailable-retry", question: "How many products are available right now?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "Live product count is temporarily unavailable.", retrySummary: "This store has 42 sellable products in the catalogue.", answerIncludes: ["42 sellable products"], forbiddenItems: ["Open Products to browse"], structured: true, intent: "product_count", type: "product_count", retryFirst: true, unavailableAnswer: "Live product count is temporarily unavailable.", retryAnswer: "This store has 42 sellable products in the catalogue." },
  { id: "product-count-unavailable-not-configured", question: "How many products while Odoo is not configured?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "Product count unavailable: Odoo is not configured for this store. Contact an administrator.", answerIncludes: ["not configured"], forbiddenItems: ["Retry"], expectedStatus: "Unavailable", retryable: false, expectRetryHidden: true, structured: true, intent: "product_count", type: "product_count", status: "unavailable" },
  { id: "product-count-unavailable-retry-zh", question: "现在能查到商品总数吗？", title: "商品目录", ctaLabel: "打开商品目录", route: "/products", expectedRoute: "/products/odoo", summary: "当前暂时无法获取商品总数，请稍后重试。", retrySummary: "本店商品目录共有 42 个可售商品。", answerIncludes: ["42 个可售商品"], unavailableIncludes: ["商品数据暂时无法连接"], forbiddenItems: ["打开商品目录查看"], expectedStatus: "暂不可用", retryLabel: "重试", retryStatusLabel: "可用", structured: true, intent: "product_count", type: "product_count", retryFirst: true, unavailableAnswer: "当前暂时无法获取商品总数，请稍后重试。", retryAnswer: "本店商品目录共有 42 个可售商品。", unavailableReason: "商品数据暂时无法连接，请重试。" },
  { id: "product-count-permission-denied", question: "How many products can I access?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "Product count is unavailable because your account lacks report access.", unavailableIncludes: ["lacks report access"], answerIncludes: ["42 sellable products"], retrySummary: "This store has 42 sellable products in the catalogue.", retryAnswer: "This store has 42 sellable products in the catalogue.", structured: true, intent: "product_count", type: "product_count", retryFirst: true, unavailableAnswer: "Product count is unavailable because your account lacks report access." },
  { id: "product-count-store-unlinked", question: "How many products are in this unlinked store?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "Product count is unavailable because this store is not linked to Odoo.", unavailableIncludes: ["not linked to Odoo"], answerIncludes: ["42 sellable products"], retrySummary: "This store has 42 sellable products in the catalogue.", retryAnswer: "This store has 42 sellable products in the catalogue.", structured: true, intent: "product_count", type: "product_count", retryFirst: true, unavailableAnswer: "Product count is unavailable because this store is not linked to Odoo." },
  { id: "product-count-odoo-unavailable", question: "How many products are there while Odoo is offline?", title: "Product catalogue", ctaLabel: "Open products", route: "/products", expectedRoute: "/products/odoo", summary: "Product count is unavailable because Odoo cannot be reached.", unavailableIncludes: ["Odoo cannot be reached"], answerIncludes: ["42 sellable products"], retrySummary: "This store has 42 sellable products in the catalogue.", retryAnswer: "This store has 42 sellable products in the catalogue.", structured: true, intent: "product_count", type: "product_count", retryFirst: true, unavailableAnswer: "Product count is unavailable because Odoo cannot be reached." },
  { id: "legacy-generic-sommelier", question: "Recommend a red wine under $30", title: "Wine recommendations", ctaLabel: "Open workflow", expectedCtaLabel: "Open wine recommendations", route: "/sommelier", summary: "Fixture wine recommendations.", structured: false, intent: "navigate", type: "sommelier" },
  { id: "sommelier-ready-top-three", question: "Recommend a wine with available picks", title: "Wine recommendations", ctaLabel: "Open wine recommendations", route: "/sommelier", summary: "In-stock picks for your request:", answer: "In-stock picks for your request:\n• Shiraz — $24.99\n• Pinot Noir — $28.00\n• Cabernet — $29.50\n• Merlot — $31.00", items: [{ label: "Shiraz — $24.99" }, { label: "Pinot Noir — $28.00" }, { label: "Cabernet — $29.50" }, { label: "Merlot — $31.00" }], expectedItems: ["Shiraz — $24.99", "Pinot Noir — $28.00", "Cabernet — $29.50"], forbiddenItems: ["Merlot — $31.00"], structured: true, intent: "navigate", type: "sommelier" },
  { id: "sommelier-empty", question: "Recommend a wine with no matching picks", title: "Wine recommendations", ctaLabel: "Open wine recommendations", route: "/sommelier", summary: "No recommendations are available: widen the price range or try another style.", answer: "No recommendations are available: widen the price range or try another style.", emptyReason: "Widen the price range or try another style.", expectedStatus: "No match", structured: true, intent: "navigate", type: "sommelier", status: "empty" },
  { id: "grocery-ready-top-three", question: "Recommend beer for a BBQ under $20", title: "Grocery recommendations", ctaLabel: "Open grocery recommendations", route: "/recommend/grocery", expectedRoute: "/recommend/grocery", summary: "In-stock grocery recommendations:", answer: "In-stock grocery recommendations:\n• Lager — $4.50 (10 in stock)\n• IPA — $7.50 (6 in stock)\n• Cider — $8.00 (4 in stock)\n• Stout — $9.00 (2 in stock)", items: [{ label: "Lager — $4.50 (10 in stock)" }, { label: "IPA — $7.50 (6 in stock)" }, { label: "Cider — $8.00 (4 in stock)" }, { label: "Stout — $9.00 (2 in stock)" }], expectedItems: ["Lager — $4.50 (10 in stock)", "IPA — $7.50 (6 in stock)", "Cider — $8.00 (4 in stock)"], forbiddenItems: ["Stout — $9.00 (2 in stock)"], structured: true, intent: "navigate", type: "recommend" },
  { id: "grocery-empty", question: "Recommend snacks with no matching picks", title: "Grocery recommendations", ctaLabel: "Open grocery recommendations", route: "/recommend/grocery", expectedRoute: "/recommend/grocery", summary: "No grocery recommendations are available: Nothing in stock matches that category and budget.", answer: "No grocery recommendations are available: Nothing in stock matches that category and budget.", emptyReason: "Nothing in stock matches that category and budget.", expectedStatus: "No match", structured: true, intent: "navigate", type: "recommend", status: "empty" },
  { id: "grocery-unavailable-retry", question: "Retry grocery recommendations after a service error", title: "Grocery recommendations", ctaLabel: "Open grocery recommendations", route: "/recommend/grocery", expectedRoute: "/recommend/grocery", summary: "Fixture grocery service status.", retrySummary: "In-stock grocery recommendations:", retryAnswer: "In-stock grocery recommendations:\n• Lager — $4.50 (10 in stock)", answerIncludes: ["Lager — $4.50 (10 in stock)"], items: [{ label: "Lager — $4.50 (10 in stock)" }], structured: true, intent: "navigate", type: "recommend", retryFirst: true },
  { id: "replenishment-ready-top-three", question: "Show replenishment suggestions with results", title: "Replenishment suggestions", ctaLabel: "Open replenishment", route: "/stock/replenishment", summary: "Top replenishment suggestions:", answer: "Top replenishment suggestions:\n• Shiraz — order 6\n• Lager — order 12\n• Pinot Noir — order 3", items: [{ label: "Shiraz — order 6" }, { label: "Lager — order 12" }, { label: "Pinot Noir — order 3" }], expectedItems: ["Shiraz — order 6", "Lager — order 12", "Pinot Noir — order 3"], structured: true, intent: "navigate", type: "replenishment" },
  { id: "replenishment-empty", question: "Show replenishment suggestions with no results", title: "Replenishment suggestions", ctaLabel: "Open replenishment", route: "/stock/replenishment", summary: "No restock suggestions are available right now.", answer: "No restock suggestions are available right now.", emptyReason: "No replenishment suggestions are available right now.", expectedStatus: "No match", structured: true, intent: "navigate", type: "replenishment", status: "empty" },
  { id: "pricing-ready-top-three", question: "Show price review suggestions with results", title: "Price review suggestions", ctaLabel: "Open price review", route: "/stock/capped-pricing", summary: "Prices that need review:", answer: "Prices that need review:\n• Shiraz — $24.99 → $27.95\n• Riesling — $19.99 → $21.95\n• Merlot — $29.99 → $31.95", items: [{ label: "Shiraz — $24.99 → $27.95" }, { label: "Riesling — $19.99 → $21.95" }, { label: "Merlot — $29.99 → $31.95" }], expectedItems: ["Shiraz — $24.99 → $27.95", "Riesling — $19.99 → $21.95", "Merlot — $29.99 → $31.95"], structured: true, intent: "navigate", type: "pricing" },
  { id: "pricing-empty", question: "Show price review suggestions with no results", title: "Price review suggestions", ctaLabel: "Open price review", route: "/stock/capped-pricing", summary: "No price suggestions need review right now.", answer: "No price suggestions need review right now.", emptyReason: "No price suggestions need review right now.", expectedStatus: "No match", structured: true, intent: "navigate", type: "pricing", status: "empty" },
  { id: "sommelier-unavailable-retry", question: "Recommend a wine when recommendations are unavailable", title: "Wine recommendations", ctaLabel: "Open wine recommendations", route: "/sommelier", summary: "Fixture recommendation status.", retrySummary: "In-stock picks for your request:", retryAnswer: "In-stock picks for your request:\n• Shiraz — $24.99", answerIncludes: ["Shiraz — $24.99"], items: [{ label: "Shiraz — $24.99" }], structured: true, intent: "navigate", type: "sommelier", retryFirst: true },
  { id: "sommelier-unavailable-retry-zh", question: "推荐一款红酒，当前推荐服务不可用", title: "品鉴推荐", ctaLabel: "打开品鉴推荐", route: "/sommelier", summary: "品鉴推荐暂不可用，请打开品鉴页面重试。", unavailableAnswer: "品鉴推荐暂不可用，请打开品鉴页面重试。", retrySummary: "为你推荐以下有库存的酒款：", retryAnswer: "为你推荐以下有库存的酒款：\n• Shiraz — $24.99", answerIncludes: ["Shiraz — $24.99"], items: [{ label: "Shiraz — $24.99" }], structured: true, intent: "navigate", type: "sommelier", retryFirst: true, expectedStatus: "暂不可用", retryStatusLabel: "可用", retryLabel: "重试" },
  { id: "sommelier-api-error-retry", question: "Retry wine recommendations after a service error", title: "Wine recommendations", ctaLabel: "Open wine recommendations", route: "/sommelier", summary: "Fixture recommendation status.", retrySummary: "In-stock picks for your request:", retryAnswer: "In-stock picks for your request:\n• Shiraz — $24.99", answerIncludes: ["Shiraz — $24.99"], items: [{ label: "Shiraz — $24.99" }], structured: true, intent: "navigate", type: "sommelier", retryFirst: true, apiErrorFirst: true },
  { id: "replenishment-unavailable-retry", question: "Retry replenishment suggestions after a service error", title: "Replenishment suggestions", ctaLabel: "Open replenishment", route: "/stock/replenishment", summary: "Fixture recommendation status.", retrySummary: "Top replenishment suggestions:", retryAnswer: "Top replenishment suggestions:\n• Shiraz — order 6", answerIncludes: ["Shiraz — order 6"], items: [{ label: "Shiraz — order 6" }], structured: true, intent: "navigate", type: "replenishment", retryFirst: true },
  { id: "pricing-unavailable-retry", question: "Retry price suggestions after a service error", title: "Price review suggestions", ctaLabel: "Open price review", route: "/stock/capped-pricing", summary: "Fixture recommendation status.", retrySummary: "Prices that need review:", retryAnswer: "Prices that need review:\n• Shiraz — $24.99 → $27.95", answerIncludes: ["Shiraz — $24.99 → $27.95"], items: [{ label: "Shiraz — $24.99 → $27.95" }], structured: true, intent: "navigate", type: "pricing", retryFirst: true },
  { id: "unsafe-external-cta", question: "Open external link", title: "Action guide", ctaLabel: "Open external site", route: "https://example.com", summary: "This route must be rejected.", structured: true, unsafeRoute: true },
];
const selectedScenarioIds = (process.env.PILOT_SCENARIOS || "").split(",").map((id) => id.trim()).filter(Boolean);
const scenarios = selectedScenarioIds.length === 0
  ? allScenarios
  : allScenarios.filter((scenario) => selectedScenarioIds.includes(scenario.id));
if (selectedScenarioIds.some((id) => !scenarios.some((scenario) => scenario.id === id))) {
  throw new Error("PILOT_SCENARIOS contains an unknown scenario id");
}
const widths = (process.env.PILOT_VIEWPORTS || "320,390,768,1024,1440")
  .split(",").map((width) => Number(width.trim())).filter((width) => Number.isInteger(width) && width > 0);
if (widths.length === 0) throw new Error("PILOT_VIEWPORTS must include at least one positive integer width");
const hostResolverRules = process.env.PILOT_CHROMIUM_HOST_RESOLVER_RULES;
const browser = await chromium.launch({
  headless: true,
  args: hostResolverRules ? ["--no-proxy-server", `--host-resolver-rules=${hostResolverRules}`] : [],
});
const results = [];
const blockedWrites = [];
const fixtureRequests = [];
const unexpectedPageErrors = [];

function apiEnvelope(data) {
  return { code: 0, message: "OK", data };
}

async function runViewport(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "local-ai-card-uat", url: base }]);
  await context.addInitScript(() => {
    localStorage.setItem("sf_token", "local-ai-card-uat");
    localStorage.setItem("sf_user", JSON.stringify({
      id: "local-ai-card-uat",
      name: "Local UAT Admin",
      username: "admin",
      isAdmin: true,
      vendorId: 1,
      outletId: 1,
      platformOperator: false,
    }));
  });

  const page = await context.newPage();
  const pageErrors = [];
  const scenarioAttempts = new Map();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    fixtureRequests.push(`${request.method()} ${url.pathname}`);

    if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
      const question = String(JSON.parse(request.postData() || "{}").question || "");
      const scenario = scenarios.find((item) => item.question.toLowerCase() === question.toLowerCase());
      if (!scenario) throw new Error("Unexpected local AI prompt");
      const attempt = (scenarioAttempts.get(scenario.id) ?? 0) + 1;
      scenarioAttempts.set(scenario.id, attempt);
      const unavailable = Boolean(scenario.retryFirst && attempt === 1);
      const retryRecovered = Boolean(scenario.retryFirst && attempt > 1);
      if (scenario.apiErrorFirst && attempt === 1) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ code: 50210, message: "AI assistant temporarily unavailable", data: null }),
        });
      }
      const status = unavailable ? "unavailable" : scenario.status ?? "ready";
      const card = {
        type: scenario.type ?? (scenario.structured ? "guided_action" : "product_count"),
        title: scenario.title,
        summary: retryRecovered ? scenario.retrySummary ?? scenario.summary : scenario.summary,
        items: retryRecovered ? scenario.retryItems ?? scenario.items ?? [] : scenario.items ?? [],
        status,
        retryable: scenario.retryable,
        ...(unavailable ? { emptyReason: scenario.unavailableReason ?? "Fixture provider is temporarily unavailable." } : scenario.emptyReason ? { emptyReason: scenario.emptyReason } : {}),
        ctaLabel: scenario.ctaLabel,
        ctaRoute: scenario.route,
        ...(scenario.structured ? { cta: { label: scenario.ctaLabel, route: scenario.route } } : {}),
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(apiEnvelope({
          threadId: "local-ai-card-uat",
          intent: scenario.intent ?? (scenario.structured ? "guided_action" : "unknown"),
          intentSummary: scenario.structured ? "Guided action" : "Product count",
          answer: unavailable ? scenario.unavailableAnswer ?? `${scenario.title} are temporarily unavailable.` : retryRecovered ? scenario.retryAnswer ?? scenario.answer ?? "Fixture retry result." : scenario.answer ?? (scenario.structured ? "Use this link to continue." : "Fixture catalogue answer."),
          slots: scenario.slots ?? {},
          ui: scenario.legacySaleAction
            ? { action: scenario.legacyAction }
            : scenario.legacyEntityAction ? { route: scenario.suggestedRoute } : null,
          cards: scenario.legacySaleAction || scenario.legacyEntityAction || scenario.noCard ? [] : [card],
          fastPathId: scenario.fastPathId ?? null,
          table: scenario.table ?? null,
          reportId: scenario.reportId ?? null,
          writeRequests: [],
        })),
      });
    }

    if (request.method() === "POST" && url.pathname === "/api/odoo/records") {
      const body = request.postDataJSON() || {};
      const records = body.type === "products"
        ? [{ id: 101, name: "DEMO Shiraz", display_name: "DEMO Shiraz", default_code: "DEMO-SHIRAZ", barcode: false, list_price: 14, qty_available: 4, free_qty: 4, available_in_pos: true, pos_categ_ids: [[10, "Wine"]], uom_id: [1, "Units"] }]
        : body.type === "posCategories"
          ? [{ id: 10, name: "Wine", parent_id: false }]
          : body.type === "customers"
            ? [{ id: 501, name: "Fixture Retailer", phone: "0412000000", email: "retailer@example.test", ref: "FIX-501", property_product_pricelist: [3, "Fixture Retail"], category_id: [9], credit: 12.5, total_invoiced: 100, company_type: "company", street: "1 Test St", city: "Adelaide" }]
            : null;
      if (records) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: records, limit: body.limit ?? 30, offset: body.offset ?? 0, hasNext: false }),
        });
      }
    }

    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      if (url.pathname === "/api/odoo/session") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: { uid: 7, name: "Local UAT Odoo" }, autoRecoverConfigured: false }),
        });
      }
      if (url.pathname === "/api/odoo/pos-bootstrap") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ configs: [{ id: 2, name: "Fixture Register", company: [1, "Local UAT Store"], timezone: "Australia/Adelaide", session: null, paymentMethods: [] }], activeSessionId: null }),
        });
      }
      if (url.pathname === "/api/odoo/replenishment") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            company: "Local UAT Store",
            historyDays: 84,
            periodDays: 21,
            coverageDays: Number(url.searchParams.get("coverageDays") || 21),
            products: [{ id: 101, name: "DEMO Shiraz", sku: "DEMO-SHIRAZ", unit: "Units", soldUnits: 8, recentUnits: 5, previousUnits: 3, unitsPerDay: 0.38, trendPercent: 66.7, trend: "up", onHand: 2, forecastStock: 2, daysOfStock: 5.3, suggestedQuantity: 6, reason: "Recent sales are increasing while stock cover is low.", reasonParts: ["Low current stock", "Increasing recent demand"], method: "sales_velocity" }],
            truncated: false,
            generatedAt: "2026-10-23T00:00:00Z",
          }),
        });
      }
      if (url.pathname === "/api/odoo/pricelist-items") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [{ id: "rule-1", productId: 101, productName: "DEMO Shiraz", sku: "DEMO-SHIRAZ", priceSetName: "Fixture Retail", source: "Odoo price rule", sourceType: "PROVIDED", startDate: "2026-01-01", endDate: "2026-12-31", quantity: 1, cappedPrice: 16, currentPrice: 14, cost: null, ruleType: "fixed" }], limit: 30, offset: 0, hasNext: false }),
        });
      }
      if (url.pathname === "/api/odoo/pricelists") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 3, name: "Fixture Retail", currency: "AUD", currencyId: 1, company: "Local UAT Store", companyId: 1, active: true }], hasNext: false }) });
      }
      if (url.pathname === "/api/odoo/customer-groups") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ id: 9, name: "Retail Customers" }], hasNext: false }) });
      }
      if (url.pathname === "/api/odoo/reporting-dashboard") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            rangeHours: 720,
            from: "2026-09-23T00:00:00Z",
            to: "2026-10-23T00:00:00Z",
            company: "Local UAT Store",
            currency: "AUD",
            timezone: "Australia/Adelaide",
            trendGranularity: "day",
            revenue: 0,
            tax: 0,
            transactions: 0,
            itemsSold: 0,
            openRegisters: 0,
            trend: [],
            recentSales: [],
            topProducts: [],
            byCategory: [],
            compare: { revenue: 0, transactions: 0, itemsSold: 0, revenueDeltaPct: null, transactionsDeltaPct: null, itemsSoldDeltaPct: null, averageSaleDeltaPct: null },
          }),
        });
      }
      if (url.pathname === "/api/r2-archive/sales") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      }
      const data = url.pathname === "/api/auth/me"
        ? { id: "local-ai-card-uat", name: "Local UAT Admin", username: "admin", isAdmin: true, vendorId: 1, outletId: 1, platformOperator: false }
        : url.pathname === "/api/ai/config/client"
          ? { enabled: true, assistantAvailable: true, transcriptionAvailable: false, aiTriggerKeywords: [] }
          : {};
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(apiEnvelope(data)) });
    }

    blockedWrites.push(`${request.method()} ${url.pathname}`);
    return route.fulfill({
      status: 405,
      contentType: "application/json",
      body: JSON.stringify({ code: 40500, message: "Local card UAT blocks business writes", data: null }),
    });
  });

  try {
    for (const scenario of scenarios) {
      await page.goto(`${base}${entryRoute}?__uat_ai_card=${scenario.id}-${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const dialog = page.locator('[role="dialog"][aria-labelledby="orithos-ai-assistant-title"]');
      if (pagePresentation) {
        await dialog.waitFor({ state: "visible", timeout: 30000 });
      } else {
        const launch = page.getByRole("button", { name: "Open Orithos AI assistant", exact: true });
        await launch.waitFor({ state: "visible", timeout: 30000 });
        await launch.click();
        await dialog.waitFor({ state: "visible", timeout: 10000 });
      }
      // The dedicated assistant page can expose SSR controls before React has
      // hydrated them. Give the config/auth effects a short settling window.
      await page.waitForTimeout(1000);
      const composer = dialog.getByRole("textbox", { name: "Ask Orithos AI" });
      await composer.fill(scenario.question);
      const sendButton = dialog.getByRole("button", { name: "Send message", exact: true });
      await sendButton.waitFor({ state: "visible", timeout: 30000 });
      const enableDeadline = Date.now() + 30000;
      while (!(await sendButton.isEnabled())) {
        if (Date.now() >= enableDeadline) {
          throw new Error("AI_SEND_BUTTON_NOT_ENABLED");
        }
        await page.waitForTimeout(100);
      }
      await sendButton.click();
      let card = dialog.locator(`section[aria-label="${scenario.title}"]`).last();
      let cardVisible = false;
      let retryVisible = false;
      let retryControlHidden = true;
      let retryRestored = true;
      let retryDoesNotDuplicateQuestion = true;
      let unavailableVisible = false;
      let unavailableReasonCorrect = true;
      let singleCardFrame = true;
      let statusVisible = false;
      let tableVisible = false;
      let tableText = "";
      let reportLinkVisible = false;
      let finalStatusLabel = scenario.expectedStatus ?? (scenario.status === "empty" ? "No match" : "Ready");
      if (scenario.retryFirst) {
        if (scenario.apiErrorFirst) {
          await dialog.getByText(/The AI assistant is temporarily unavailable\. Check the AI configuration and try again\./)
            .waitFor({ state: "visible", timeout: 10000 });
        } else {
          await card.waitFor({ state: "visible", timeout: 10000 });
          unavailableVisible = await card.getByText(scenario.expectedStatus ?? "Unavailable", { exact: true }).isVisible();
          const unavailableText = await card.innerText();
          unavailableReasonCorrect = (scenario.unavailableIncludes ?? []).every((text) => unavailableText.includes(text));
        }
        const retry = dialog.getByRole("button", { name: scenario.retryLabel ?? "Retry", exact: true }).last();
        retryVisible = await retry.isVisible();
        await retry.click();
        card = dialog.locator(`section[aria-label="${scenario.title}"]`).last();
        finalStatusLabel = scenario.retryStatusLabel ?? "Ready";
        await card.getByText(finalStatusLabel, { exact: true }).waitFor({ state: "visible", timeout: 10000 });
        cardVisible = true;
        statusVisible = true;
        retryRestored = scenarioAttempts.get(scenario.id) === 2;
        retryDoesNotDuplicateQuestion = await dialog.getByText(scenario.question, { exact: true }).count() === 1;
      } else if (scenario.legacySaleAction || scenario.legacyEntityAction) {
        await dialog.getByRole("button", { name: scenario.ctaLabel, exact: true })
          .waitFor({ state: "visible", timeout: 10000 });
        statusVisible = true;
      } else if (scenario.noCard) {
        const reportTable = dialog.getByRole("table", { name: "Assistant result table", exact: true });
        await reportTable.waitFor({ state: "visible", timeout: 10000 });
        tableVisible = true;
        tableText = await reportTable.innerText();
        reportLinkVisible = await dialog.locator(`a[href="/reports/ai/${scenario.reportId}"]`).count() === 1;
        statusVisible = true;
      } else {
        await card.waitFor({ state: "visible", timeout: 10000 });
        cardVisible = true;
        if (scenario.expectRetryHidden) {
          retryControlHidden = await dialog.getByRole("button", { name: scenario.retryLabel ?? "Retry", exact: true }).count() === 0;
        }
        const frame = await card.evaluate((element) => {
          const bubble = element.parentElement?.parentElement;
          if (!bubble) return null;
          const style = getComputedStyle(bubble);
          return {
            borderWidth: style.borderTopWidth,
            backgroundColor: style.backgroundColor,
            boxShadow: style.boxShadow,
          };
        });
        singleCardFrame = frame?.borderWidth === "0px"
          && frame.backgroundColor === "rgba(0, 0, 0, 0)"
          && frame.boxShadow === "none";
        statusVisible = await card.getByText(finalStatusLabel, { exact: true }).isVisible();
      }
      const cardText = scenario.legacySaleAction || scenario.legacyEntityAction || scenario.noCard ? await dialog.innerText() : await card.innerText();
      const answerCorrect = (scenario.answerIncludes ?? []).every((text) => cardText.includes(text));
      const expectedItemsVisible = (scenario.expectedItems ?? []).every((text) => cardText.includes(text));
      const forbiddenItemsHidden = (scenario.forbiddenItems ?? []).every((text) => !cardText.includes(text));
      const emptyReasonNotDuplicated = !scenario.emptyReason
        || cardText.split(scenario.emptyReason).length <= 2;
      const hasUnavailableCopy = /\b(?:unavailable|not available|temporarily unavailable)\b/i.test(cardText) || cardText.includes("暂不可用");
      const statusConsistent = scenario.legacySaleAction || scenario.legacyEntityAction || scenario.noCard || (statusVisible
        && (finalStatusLabel === "Unavailable" || finalStatusLabel === "暂不可用" ? hasUnavailableCopy : !hasUnavailableCopy));
      const expectedIntent = scenario.intent ?? (scenario.structured ? "guided_action" : "unknown");
      const diagnosticCorrect = await dialog.locator("span")
        .filter({ hasText: new RegExp(`^AI · ${expectedIntent} · \\d+ms$`) })
        .count() > 0;
      const cta = scenario.noCard
        ? null
        : scenario.legacySaleAction || scenario.legacyEntityAction
        ? dialog.getByRole("button", { name: scenario.ctaLabel, exact: true })
        : card.getByRole("button", { name: scenario.expectedCtaLabel ?? scenario.ctaLabel, exact: true });
      const routeBeforeClick = new URL(page.url()).pathname;
      const sourceLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      const screenshot = path.join(screenshotDir, `${scenario.id}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot });
      let ctaVisible = !scenario.noCard;
      let unsafeCtaHidden = false;
      let destination = scenario.route;
      if (scenario.unsafeRoute) {
        await page.waitForTimeout(100);
        ctaVisible = await cta.count() > 0;
        destination = new URL(page.url()).pathname;
        unsafeCtaHidden = !ctaVisible && destination === entryRoute;
      } else if (!scenario.noCard) {
        await cta.waitFor({ state: "visible", timeout: 10000 });
        await cta.click();
        const expectedRoute = scenario.expectedRoute || scenario.route;
        await page.waitForFunction(
          (pathname) => window.location.pathname === pathname,
          expectedRoute,
          { timeout: 30000 },
        );
        await page.locator("#main-content").waitFor({ state: "visible", timeout: 30000 });
        await page.waitForLoadState("networkidle");
        destination = new URL(page.url()).pathname;
      } else {
        destination = new URL(page.url()).pathname;
      }
      const expectedDestination = scenario.unsafeRoute || scenario.noCard
        ? entryRoute
        : scenario.expectedRoute || scenario.route;
      const destinationCorrect = destination === expectedDestination;
      const destinationSample = {
        "/customers/odoo": "Fixture Retailer",
        "/products/odoo": "Shiraz",
        "/stock/replenishment": "Shiraz",
        "/stock/capped-pricing": "Shiraz",
      }[destination];
      if (destinationSample) {
        await page.waitForFunction(
          (sample) => document.querySelector("#main-content")?.innerText.includes(sample),
          destinationSample,
          { timeout: 10000 },
        ).catch(() => null);
      }
      const destinationText = await page.locator("#main-content").innerText().catch(() => "");
      const destinationReady = destinationSample ? destinationText.includes(destinationSample) : true;
      const destinationLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      const destinationScreenshot = path.join(screenshotDir, `${scenario.id}-destination-${viewport.width}.png`);
      await page.screenshot({ path: destinationScreenshot });
      results.push({
        viewport: viewport.width,
        scenario: scenario.id,
        diagnosticCorrect,
        cardVisible,
        cardExpected: !scenario.legacySaleAction && !scenario.legacyEntityAction && !scenario.noCard,
        singleCardFrame,
        ...(scenario.retryFirst ? { retryVisible, retryRestored, retryDoesNotDuplicateQuestion, unavailableVisible, unavailableReasonCorrect } : {}),
        ...(scenario.expectRetryHidden ? { retryControlHidden } : {}),
        statusVisible,
        tableVisible,
        tableContentCorrect: (scenario.expectedTableIncludes ?? []).every((text) => tableText.includes(text)),
        reportLinkVisible,
        answerCorrect,
        expectedItemsVisible,
        forbiddenItemsHidden,
        emptyReasonNotDuplicated,
        statusConsistent,
        ctaVisible,
        unsafeCtaHidden,
        deferredUntilClick: routeBeforeClick === entryRoute,
        expectedDestination,
        destination,
        destinationCorrect,
        destinationReady,
        ...(scenario.unsafeRoute ? { rejectedDestination: scenario.route } : {}),
        sourceNoHorizontalOverflow: sourceLayout.document <= sourceLayout.viewport,
        destinationNoHorizontalOverflow: destinationLayout.document <= destinationLayout.viewport,
        noHorizontalOverflow: sourceLayout.document <= sourceLayout.viewport && destinationLayout.document <= destinationLayout.viewport,
        pageErrors: [...pageErrors],
        screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
        destinationScreenshot: path.relative(root, destinationScreenshot).replaceAll(path.sep, "/"),
      });
    }
    unexpectedPageErrors.push(...pageErrors.map((message) => `${viewport.width}: ${message}`));
  } catch (error) {
    const failureScreenshot = path.join(screenshotDir, `failure-${viewport.width}.png`);
    await page.screenshot({ path: failureScreenshot }).catch(() => null);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  for (const width of widths) {
    await runViewport({ width, height: width < 500 ? 844 : 900 });
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) =>
  (result.cardExpected && !result.cardVisible)
  || (result.cardExpected && !result.singleCardFrame)
  || (result.scenario === "product-count-unavailable-not-configured" && !result.retryControlHidden)
  || ("retryVisible" in result && (!result.retryVisible || !result.retryRestored || !result.retryDoesNotDuplicateQuestion || !result.unavailableReasonCorrect || (!result.scenario.includes("api-error") && !result.unavailableVisible)))
  || !result.statusVisible
  || !result.answerCorrect
  || !result.expectedItemsVisible
  || !result.forbiddenItemsHidden
  || !result.emptyReasonNotDuplicated
  || !result.statusConsistent
  || (result.scenario === "unsafe-external-cta"
    ? result.ctaVisible || !result.unsafeCtaHidden
    : result.scenario === "report-sales-table"
      ? result.ctaVisible || !result.tableVisible || !result.tableContentCorrect || !result.reportLinkVisible
      : !result.ctaVisible)
  || !result.deferredUntilClick
  || !result.destinationCorrect
  || !result.destinationReady
  || !result.diagnosticCorrect
  || !result.noHorizontalOverflow
  || !result.sourceNoHorizontalOverflow
  || !result.destinationNoHorizontalOverflow
  || result.pageErrors.length > 0);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const workingTreeDirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  workingTreeDirty,
  environment: "local-next-dev-with-intercepted-apis",
  target: base,
  scope: "AI card rendering, legacy/structured CTA compatibility, deferred navigation, and responsive overflow; business APIs blocked",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  checks: results,
  blockedBusinessWrites: blockedWrites,
  fixtureRequests,
  pageErrors: unexpectedPageErrors,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  status: output.status,
  checkCount: results.length,
  failureCount: failures.length,
  failures: failures.map(({ viewport, scenario }) => ({ viewport, scenario })),
  blockedBusinessWrites: blockedWrites.length,
}));
if (output.status !== "PASS") process.exitCode = 1;
