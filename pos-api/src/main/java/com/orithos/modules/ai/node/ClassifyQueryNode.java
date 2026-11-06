package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.AssistantFastPathRouter;
import com.orithos.modules.ai.AssistantTenantContext;
import com.orithos.modules.ai.WorkflowRouteRouter;
import com.orithos.modules.ai.configstore.AiIntent;
import com.orithos.modules.ai.configstore.AiSlot;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.configstore.IntentSanitizeService.RawIntent;
import com.orithos.modules.ai.configstore.IntentSanitizeService.SanitizedIntent;
import com.orithos.modules.ai.context.FollowUpSupport;
import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.grocery.GroceryChatBrief;
import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import com.orithos.modules.ai.pricing.PricingChatBrief;
import com.orithos.modules.ai.replenishment.ReplenishmentChatBrief;
import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.ReportAdhocRouter;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.SommelierChatBrief;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Classify utterance using DB-backed prompt + whitelist, then sanitize slots.
 * High-frequency shortcuts skip the classify LLM via {@link AssistantFastPathRouter}.
 */
public class ClassifyQueryNode implements NodeAction {

    private static final Logger log = LoggerFactory.getLogger(ClassifyQueryNode.class);

    private static final String FALLBACK_CLASSIFY_PROMPT = """
            You are an intent classifier for Orithos POS.
            Classify into one allowed intent. Reply JSON only.
            """;

    private final ChatClient chatClient;
    private final IntentConfigService configService;
    private final IntentSanitizeService sanitizeService;
    private final AiProperties properties;
    private final OdooReportQueryService reportQueryService;
    private final ObjectProvider<SommelierChatBrief> sommelierChatBrief;
    private final ObjectProvider<ReplenishmentChatBrief> replenishmentChatBrief;
    private final ObjectProvider<PricingChatBrief> pricingChatBrief;
    private final ObjectProvider<GroceryChatBrief> groceryChatBrief;
    private final AiGateway aiGateway;

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService,
                             AiProperties properties) {
        this(chatClient, configService, sanitizeService, properties, null, null, null, null);
    }

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService,
                             AiProperties properties,
                             OdooReportQueryService reportQueryService,
                             ObjectProvider<SommelierChatBrief> sommelierChatBrief) {
        this(chatClient, configService, sanitizeService, properties, reportQueryService, sommelierChatBrief, null, null);
    }

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService,
                             AiProperties properties,
                             OdooReportQueryService reportQueryService,
                             ObjectProvider<SommelierChatBrief> sommelierChatBrief,
                             ObjectProvider<ReplenishmentChatBrief> replenishmentChatBrief,
                             ObjectProvider<PricingChatBrief> pricingChatBrief) {
        this(chatClient, configService, sanitizeService, properties, reportQueryService, sommelierChatBrief,
                replenishmentChatBrief, pricingChatBrief, null, null);
    }

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService,
                             AiProperties properties,
                             OdooReportQueryService reportQueryService,
                             ObjectProvider<SommelierChatBrief> sommelierChatBrief,
                             ObjectProvider<ReplenishmentChatBrief> replenishmentChatBrief,
                             ObjectProvider<PricingChatBrief> pricingChatBrief,
                             ObjectProvider<GroceryChatBrief> groceryChatBrief,
                             AiGateway aiGateway) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.sanitizeService = sanitizeService;
        this.properties = properties;
        this.reportQueryService = reportQueryService;
        this.sommelierChatBrief = sommelierChatBrief;
        this.replenishmentChatBrief = replenishmentChatBrief;
        this.pricingChatBrief = pricingChatBrief;
        this.groceryChatBrief = groceryChatBrief;
        this.aiGateway = aiGateway;
    }

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService,
                             AiProperties properties,
                             OdooReportQueryService reportQueryService,
                             ObjectProvider<SommelierChatBrief> sommelierChatBrief,
                             ObjectProvider<ReplenishmentChatBrief> replenishmentChatBrief,
                             ObjectProvider<PricingChatBrief> pricingChatBrief,
                             ObjectProvider<GroceryChatBrief> groceryChatBrief) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.sanitizeService = sanitizeService;
        this.properties = properties;
        this.reportQueryService = reportQueryService;
        this.sommelierChatBrief = sommelierChatBrief;
        this.replenishmentChatBrief = replenishmentChatBrief;
        this.pricingChatBrief = pricingChatBrief;
        this.groceryChatBrief = groceryChatBrief;
        this.aiGateway = null;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));
        String lastIntent = optionalString(state, "last_intent");
        Map<String, String> lastSlots = optionalStringMap(state, "last_slots");
        String conversationHistory = optionalString(state, "conversation_history");
        boolean historicalStockContext = FollowUpSupport.hasHistoricalStockUnavailableContext(conversationHistory)
                && (lastIntent.isBlank() || "unknown".equals(lastIntent));

        // Invoice OCR beats supplier entity-write heuristics on “upload … bill”.
        WorkflowRouteRouter.Override invoiceScan = WorkflowRouteRouter.invoiceScanOverride(question);
        if (invoiceScan != null) {
            log.info("Workflow fast-path route={}", invoiceScan.route());
            Map<String, Object> out = new HashMap<>();
            out.put("intent", invoiceScan.intent());
            WorkflowChatResult workflow = workflowChatResult(invoiceScan.route(), question);
            out.put("intent_summary", workflow.answer());
            if (workflow.card() != null) out.put("assistant_card", workflow.card());
            out.put("slots", Map.of());
            out.put("ui_panel", "");
            out.put("ui_view", "");
            out.put("ui_route", invoiceScan.route());
            out.put("ui_action", "");
            out.put("fast_path_id", "workflow");
            out.put("route_source", "deterministic");
            out.put("llm_fallback", false);
            return out;
        }

        // Explicit write requests must never reach a shortcut or the model.
        // Both paths can otherwise produce a harmless-looking read-only route
        // for words such as “submit”, “save” or “receive”.
        if (WorkflowRouteRouter.hasWriteIntent(question)) {
            log.info("Write-intent request kept in guided flow");
            boolean priceTarget = isPriceWriteTarget(question);
            String writeRoute = resolveGuidedActionRoute(question, null, optionalString(state, "ui_surface"));
            return guidedActionResult(question, writeRoute,
                    "/stock/replenishment".equals(writeRoute), "/stock/capped-pricing".equals(writeRoute));
        }

        // Relative follow-ups reuse the previous report intent ("and yesterday?").
        if (FollowUpSupport.isRelativeFollowUp(question)
                && (FollowUpSupport.isReportIntent(lastIntent)
                || "stock_history_unavailable".equals(lastIntent)
                || historicalStockContext)
                && !"report_adhoc".equals(lastIntent)) {
            if ("report_stock".equals(lastIntent) || "stock_history_unavailable".equals(lastIntent)
                    || historicalStockContext) {
                String message = isChinese(question)
                        ? "历史库存查询暂不可用；当前库存报表是实时快照，不能还原历史库存。请打开库存列表查看当前库存。"
                        : "Stock reports show a live snapshot; historical stock is unavailable. Open the stock page to view current stock.";
                Map<String, Object> result = shortcutResult(
                        "stock_history_unavailable", message, Map.of(), "", "", "/stock/list", "");
                result.put("fast_path_id", "historical_stock_unavailable");
                return result;
            }
            log.info("Follow-up fast-path intent={}", lastIntent);
            Map<String, String> slots = FollowUpSupport.mergeFollowUpSlots(
                    question, lastIntent, Map.of(), lastSlots);
            return shortcutResult(lastIntent, "Follow-up report", slots, "", "", "", "");
        }

        // Product catalogue count before other product lookup shortcuts.
        if (isProductCountUtterance(question)) {
            log.info("Product-count fast-path (skipped classify LLM)");
            return productCountShortcut(new AssistantFastPathRouter.Match(
                    "product_count",
                    "Live product count is unavailable right now. Please try again shortly.",
                    Map.of(),
                    "/products",
                    "products",
                    "",
                    ""), question);
        }

        // Explicit workflow requests are deterministic navigation intents. Resolve
        // them before generic report refusals and the classifier so a temporary
        // provider outage cannot block safe replenishment, pricing, sommelier or
        // invoice preview navigation. The router excludes historical/report and
        // write requests, which retain their own boundaries below.
        WorkflowRouteRouter.Override directWorkflow = WorkflowRouteRouter.maybeOverride(question);
        if (directWorkflow != null) {
            log.info("Workflow fast-path route={}", directWorkflow.route());
            Map<String, Object> out = new HashMap<>();
            out.put("intent", directWorkflow.intent());
            WorkflowChatResult workflow = workflowChatResult(directWorkflow.route(), question);
            out.put("intent_summary", workflow.answer());
            if (workflow.card() != null) out.put("assistant_card", workflow.card());
            out.put("slots", Map.of());
            out.put("ui_panel", "");
            out.put("ui_view", "");
            out.put("ui_route", directWorkflow.route());
            out.put("ui_action", "");
            out.put("fast_path_id", "workflow");
            out.put("route_source", "deterministic");
            out.put("llm_fallback", false);
            return out;
        }

        // Explicit unsupported comparisons should keep their guided refusal even
        // when a date or metric token also matches a supported report shortcut.
        if (ReportAdhocRouter.shouldUseNl2Sql(question)) {
            log.info("Ad-hoc report fast-path (skipped classify LLM)");
            return shortcutResult(
                    "report_adhoc",
                    "This custom report is not available yet.",
                    Map.of(), "", "", "", "");
        }

        AssistantFastPathRouter.Match fast = AssistantFastPathRouter.maybeMatch(question);
        if (fast != null) {
            log.info("Fast-path intent={} (skipped classify LLM)", fast.intent());
            if ("search_product".equals(fast.intent())
                    && fast.slots().get("query") != null && !fast.slots().get("query").isBlank()) {
                return productSearchShortcut(fast, question);
            }
            return shortcutResult(fast.intent(), fast.summary(), fast.slots(), fast.panel(), fast.view(),
                    fast.route(), fast.action());
        }

        IntentConfigService.Snapshot snap = configService.getSnapshot();
        String system = snap.promptContent(IntentConfigService.PROMPT_CLASSIFY, FALLBACK_CLASSIFY_PROMPT);
        String history = optionalString(state, "conversation_history");
        String storeContext = optionalString(state, "store_context");
        String userPrompt = buildUserPrompt(snap, question, history, storeContext);

        RawIntent raw = callModel(system, userPrompt, tenantContext(state));
        SanitizedIntent result = sanitizeService.sanitize(raw);
        if (isWriteEntityResult(result) || isUnknownEntityOperation(result)) {
            String route = resolveGuidedActionRoute(
                    question, result.slots().get("entity"), optionalString(state, "ui_surface"));
            return guidedActionResult(question, route,
                    "/stock/replenishment".equals(route), "/stock/capped-pricing".equals(route));
        }
        if ("sale_action".equals(result.intent())) {
            String action = result.action() == null ? "" : result.action().trim();
            String route = "Create Customer".equalsIgnoreCase(action) ? "/customers"
                    : "Create Product".equalsIgnoreCase(action) ? "/products"
                    : writeRouteForQuestion(question, isStockWriteTarget(question), isPriceWriteTarget(question));
            if (route.isBlank()) route = "/";
            return guidedActionResult(question, route,
                    "/stock/replenishment".equals(route), "/stock/capped-pricing".equals(route));
        }
        WorkflowRouteRouter.Override workflow = WorkflowRouteRouter.maybeOverride(question);
        String intent = workflow == null
                ? ReportAdhocRouter.maybeOverride(question, result.intent())
                : workflow.intent();
        // A report override must discard any model-supplied workflow route. This
        // keeps report wording from opening a page that the classifier guessed.
        String route = workflow == null
                ? (intent != null && intent.equals(result.intent()) ? nullToEmpty(result.route()) : "")
                : workflow.route();
        if (intent != null && !intent.equals(result.intent())) {
            log.info("Forced intent {} -> {} for explicit workflow request", result.intent(), intent);
        }

        Map<String, String> slots = FollowUpSupport.mergeFollowUpSlots(
                question, lastIntent, result.slots(), lastSlots);
        String summary = result.summary();
        AssistantCard assistantCard = null;
        if ("/recommend/grocery".equals(route)) {
            WorkflowChatResult workflowResult = workflowChatResult(route, question);
            summary = workflowResult.answer();
            assistantCard = workflowResult.card();
        } else if ("/sommelier".equals(route) || "/stock/replenishment".equals(route)
                || "/stock/capped-pricing".equals(route)) {
            summary = workflowChatSummary(route, question);
        }

        log.debug("Classified intent={}", intent);

        Map<String, Object> out = new HashMap<>();
        out.put("intent", intent);
        out.put("intent_summary", summary);
        out.put("slots", slots);
        out.put("ui_panel", nullToEmpty(result.panel()));
        out.put("ui_view", nullToEmpty(result.view()));
        out.put("ui_route", route);
        out.put("ui_action", nullToEmpty(result.action()));
        if (assistantCard != null) out.put("assistant_card", assistantCard);
        out.put("fast_path_id", "llm_classifier");
        out.put("route_source", "llm");
        out.put("llm_fallback", true);
        return out;
    }

    /**
     * In-chat summary for navigate workflows (restock / pricing / wine). Falls back to a
     * soft placeholder when the matching brief bean or Odoo data is unavailable.
     */
    private String workflowChatSummary(String route, String question) {
        TenantContext tenant = AssistantTenantContext.get();
        if ("/sommelier".equals(route) && sommelierChatBrief != null) {
            SommelierChatBrief brief = sommelierChatBrief.getIfAvailable();
            if (brief != null) {
                return brief.brief(question, tenant);
            }
        }
        if ("/stock/replenishment".equals(route) && replenishmentChatBrief != null) {
            ReplenishmentChatBrief brief = replenishmentChatBrief.getIfAvailable();
            if (brief != null) {
                return brief.brief(question, tenant);
            }
        }
        if ("/stock/capped-pricing".equals(route) && pricingChatBrief != null) {
            PricingChatBrief brief = pricingChatBrief.getIfAvailable();
            if (brief != null) {
                return brief.brief(question, tenant);
            }
        }
        return "Opening the requested workflow.";
    }

    private WorkflowChatResult workflowChatResult(String route, String question) {
        if ("/recommend/grocery".equals(route) && groceryChatBrief != null) {
            GroceryChatBrief brief = groceryChatBrief.getIfAvailable();
            if (brief != null) {
                GroceryChatBrief.Brief result = brief.result(question, AssistantTenantContext.get());
                return new WorkflowChatResult(result.answer(), result.card());
            }
        }
        return new WorkflowChatResult(workflowChatSummary(route, question), null);
    }

    private record WorkflowChatResult(String answer, AssistantCard card) {}

    private static boolean isStockWriteTarget(String question) {
        if (question == null) {
            return false;
        }
        return question.matches(
                "(?is).*(?:把.+?(?:补到|补足|补至|加到)\\s*\\d+"
                        + "|(?:top up|restock|replenish|bring)\\b.+?(?:to|up to)\\s*\\d+).*");
    }

    private static String writeRouteForQuestion(String question, boolean stockTarget, boolean priceTarget) {
        // Mutation review destinations stay deterministic even when a classifier is unavailable.
        if (priceTarget) return "/stock/capped-pricing";
        if (isInvoiceWriteTarget(question)) return "/invoices";
        if (isStocktakeTarget(question)) return "/stocktake";
        if (isCustomerBalanceTarget(question)) return "/customers/balances";
        if (isCustomerGroupTarget(question)) return "/customer-groups";
        if (isPriceListTarget(question)) return "/pricelists";
        if (isGiftCardTarget(question)) return "/giftcards";
        if (isClassificationTarget(question)) return "/classifications";
        if (isBuyingPeriodTarget(question)) return "/stock/buying-periods";
        if (stockTarget || isStockMutationTarget(question)) return "/stock/replenishment";
        // Purchase/order language must win over a product noun in phrases such as
        // "buy these items" or "order these products".
        if (isOrderWriteTarget(question)) return "/orders";
        if (isCustomerWriteTarget(question)) return "/customers";
        if (isSupplierWriteTarget(question)) return "/suppliers/odoo";
        if (isProductWriteTarget(question)) return "/products";
        return "";
    }

    static Map<String, Object> guidedActionResult(
            String question, String route, boolean stockTarget, boolean priceTarget) {
        boolean chinese = question != null && question.matches("(?s).*[\\u3400-\\u9fff].*");
        String summary;
        if (stockTarget) {
            summary = chinese
                    ? "我不能在聊天中直接调整库存。请在补货页面核对商品、订货数量和供应商，再由你确认订单。"
                    : "I cannot adjust stock from chat. Review the items, order quantities and supplier on the replenishment page before confirming an order.";
        } else if (priceTarget) {
            summary = chinese
                    ? "我不能在聊天中直接改价。请在价格复核页面核对每项价格和受影响商品，再由你确认应用。"
                    : "I cannot change prices from chat. Review each proposed price and affected product on the price review page before applying changes.";
        } else {
            String target = guidedTargetName(route, chinese);
            boolean unknownTarget = "/".equals(route);
            summary = chinese
                    ? unknownTarget
                            ? "我不能在聊天中直接执行写入。请先说明要操作的对象和具体变更；你可以从工作区页面继续，核对目标记录和影响后再确认。"
                            : "我可以引导你处理" + target + "。请在对应页面填写必填信息，核对目标记录和变更内容后再完成操作；聊天不会直接写入业务数据。"
                    : unknownTarget
                            ? "I cannot perform writes from chat. Please specify the target and exact change, then continue from the workspace and verify the record and impact before confirming."
                            : "I can guide this " + target + " change. Complete the required fields and verify the target record and impact on the page before completing the action; chat does not write business data.";
        }
        return shortcutResult("guided_action", summary, Map.of(), "", "", route, "");
    }

    public static String resolveGuidedActionRoute(String question, String entity, String surface) {
        String route = writeRouteForQuestion(question, isStockWriteTarget(question), isPriceWriteTarget(question));
        if (route.isBlank()) route = guidedRouteForTarget(entity);
        return route.isBlank() ? fallbackRouteForSurface(surface) : route;
    }

    static String fallbackRouteForSurface(String surface) {
        if (surface == null) return "/";
        return switch (surface.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "products" -> "/products";
            case "customers" -> "/customers";
            case "stock" -> "/stock/replenishment";
            case "invoices" -> "/invoices";
            case "sommelier" -> "/sommelier";
            case "sell", "reports", "" -> "/";
            default -> "/";
        };
    }

    private static String guidedTargetName(String route, boolean chinese) {
        if (chinese) {
            return switch (route == null ? "" : route) {
                case "/customers" -> "客户资料变更";
                case "/products" -> "商品目录变更";
                case "/orders" -> "采购订单变更";
                case "/invoices" -> "供应商发票操作";
                case "/suppliers/odoo" -> "供应商资料变更";
                case "/stocktake" -> "库存盘点";
                case "/customers/balances" -> "客户余额变更";
                case "/customer-groups" -> "客户分组变更";
                case "/pricelists" -> "价目表变更";
                case "/giftcards" -> "礼品卡操作";
                case "/classifications" -> "商品分类变更";
                case "/stock/buying-periods" -> "采购周期变更";
                case "/stock/replenishment" -> "补货操作";
                case "/" -> "销售页面操作";
                default -> "这项业务变更";
            };
        }
        return switch (route == null ? "" : route) {
            case "/customers" -> "customer";
            case "/products" -> "product catalogue";
            case "/orders" -> "purchase order";
            case "/invoices" -> "supplier invoice";
            case "/suppliers/odoo" -> "supplier";
            case "/stocktake" -> "stocktake";
            case "/customers/balances" -> "customer balance";
            case "/customer-groups" -> "customer group";
            case "/pricelists" -> "price list";
            case "/giftcards" -> "gift card";
            case "/classifications" -> "product classification";
            case "/stock/buying-periods" -> "buying period";
            case "/stock/replenishment" -> "replenishment";
            case "/" -> "POS";
            default -> "business";
        };
    }

    private static boolean isPriceWriteTarget(String question) {
        if (question == null) {
            return false;
        }
        return question.matches(
                "(?is).*(?:把.+?(?:价格|售价)\\s*(?:改成|调整为|设为)\\s*\\$?\\d+"
                        + "|(?:(?:帮我)?(?:直接\\s*)?)把.*?(?:价格|售价)(?:改了|改掉|改成|调整为|设为)"
                        + "|\\b(?:set|change|raise|lower)\\b.+?\\b(?:price|to)\\b\\s*\\$?\\d+"
                        + "|\\b(?:set|change|raise|lower|update|apply|save|submit|confirm|reprice)\\b.+?\\b(?:prices?|pricing)\\b"
                        + "|\\b(?:prices?|pricing)\\b.+?\\b(?:set|change|raise|lower|update|apply|save|submit|confirm|reprice)\\b"
                        + "|(?:更新|应用|保存|提交|确认|设置|修改|调价|改价).*?(?:价格|售价|价目)"
                        + "|(?:价格|售价|价目).*?(?:更新|应用|保存|提交|确认|设置|修改|调价|改价)"
                        + "|\\b(?:apply|save|submit|execute)\\b.+?\\b(?:prices?|pricing)\\b"
                        + "|直接(?:调价|改价)|(?:保存|提交|执行|应用|调价|改价|设置|修改)(?:这些|那些)?(?:价格|售价|价目|价格建议|调价)).*");
    }

    private static boolean isCustomerWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:customer|client|客户|顾客).*");
    }

    private static boolean isProductWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:product|item|catalogue|catalog|产品|商品).*");
    }

    private static boolean isStockMutationTarget(String question) {
        return question != null && question.matches("(?is).*(?:stock|inventory|receive|replenishment|restock|top up|收货|库存|补货|盘点).*");
    }

    private static boolean isInvoiceWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:invoice|bill|发票|账单).*");
    }

    private static boolean isOrderWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:order|purchase|buy|采购|购买|订|下单|订单).*");
    }

    private static boolean isSupplierWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:supplier|vendor|供应商).*");
    }

    private static boolean isStocktakeTarget(String question) {
        return question != null && question.matches("(?is).*(?:stocktake|stock take|盘点).*");
    }

    private static boolean isCustomerBalanceTarget(String question) {
        return question != null && question.matches("(?is).*(?:(?:customer\\s+)?balances?|客户余额).*");
    }

    private static boolean isCustomerGroupTarget(String question) {
        return question != null && question.matches("(?is).*(?:customer\\s+group|customer groups|客户分组).*");
    }

    private static boolean isPriceListTarget(String question) {
        return question != null && question.matches("(?is).*(?:price\\s+lists?|价目表|价格表).*");
    }

    private static boolean isGiftCardTarget(String question) {
        return question != null && question.matches("(?is).*(?:gift\\s*cards?|礼品卡).*");
    }

    private static boolean isClassificationTarget(String question) {
        return question != null && question.matches("(?is).*(?:classifications?|分类).*");
    }

    private static boolean isBuyingPeriodTarget(String question) {
        return question != null && question.matches("(?is).*(?:buying\\s+periods?|采购周期).*");
    }

    private static boolean isWriteEntityResult(SanitizedIntent result) {
        if (result == null || !"entity_action".equals(result.intent())) return false;
        String op = result.slots().get("op");
        return op != null && op.matches("(?i)(create|add|edit|update|modify|delete|remove|merge|import|upload|receive|return|transfer|adjust|change|set|reprice|confirm|approve|save|submit|send|publish|book|post|close|refund|buy|order|sell|write)");
    }

    private static boolean isUnknownEntityOperation(SanitizedIntent result) {
        if (result == null || !"entity_action".equals(result.intent())) return false;
        String op = result.slots().get("op");
        return op == null || !op.matches("(?i)(list|search|view|get|lookup|find|show)");
    }

    private static String guidedRouteForTarget(String target) {
        if (target == null) return "";
        return switch (target.toLowerCase(java.util.Locale.ROOT)) {
            case "customer", "client" -> "/customers";
            case "product", "item", "catalogue", "catalog" -> "/products";
            case "invoice", "bill" -> "/invoices";
            case "supplier", "vendor" -> "/suppliers/odoo";
            case "order", "purchase" -> "/orders";
            case "stock", "inventory" -> "/stock/replenishment";
            case "classification", "category" -> "/classifications";
            case "customer_group", "customer group" -> "/customer-groups";
            case "price_list", "price list" -> "/pricelists";
            case "gift_card", "gift card" -> "/giftcards";
            case "stocktake", "stock_take" -> "/stocktake";
            case "buying_period", "buying period" -> "/stock/buying-periods";
            case "balance", "customer_balance", "customer balance" -> "/customers/balances";
            default -> "";
        };
    }

    private static String optionalString(OverAllState state, String key) {
        Optional<String> value = state.value(key, String.class);
        return value == null ? "" : value.orElse("");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> optionalStringMap(OverAllState state, String key) {
        Optional<Object> value = state.value(key);
        if (value == null || value.isEmpty() || !(value.get() instanceof Map<?, ?> raw)) {
            return Map.of();
        }
        Map<String, String> out = new HashMap<>();
        raw.forEach((k, v) -> {
            if (k != null && v != null) {
                out.put(k.toString(), v.toString());
            }
        });
        return out;
    }

    private Map<String, Object> productCountShortcut(AssistantFastPathRouter.Match fast, String question) {
        TenantContext tenant = AssistantTenantContext.get();
        if (tenant == null) {
            String message = isChinese(question)
                    ? "请先登录门店账号，才能查询实时商品总数。"
                    : "Sign in to a store to read the live product total.";
            return shortcutResult("product_count",
                    message,
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        if (tenant.requireOutletId() == null) {
            String message = isChinese(question)
                    ? "当前账号尚未绑定门店，暂时无法查询实时商品总数。"
                    : "Your account is not bound to a store, so the live product total is unavailable.";
            return shortcutResult("product_count",
                    message,
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        if (!tenant.canQueryReport()) {
            String message = isChinese(question)
                    ? "你没有权限查询实时商品总数。"
                    : "You do not have permission to query the live product total.";
            return shortcutResult("product_count",
                    message,
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        OdooReportQueryService.ProductCountResult result = null;
        if (reportQueryService != null) {
            result = reportQueryService.countSellableProducts(tenant);
        }
        boolean chinese = isChinese(question);
        String error = result == null ? "ODOO_REPORT_UNAVAILABLE" : result.error();
        String summary = result != null && result.count() != null && error == null
                ? productCountSummary(result.count(), chinese)
                : productCountFailureMessage(error, chinese);
        return shortcutResult("product_count", summary, Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
    }

    private Map<String, Object> productSearchShortcut(AssistantFastPathRouter.Match fast, String question) {
        String query = fast.slots().get("query").trim();
        TenantContext tenant = AssistantTenantContext.get();
        OdooReportQueryService.ProductSearchResult result = reportQueryService == null
                ? null : reportQueryService.searchProducts(tenant, query, 5);
        String summary;
        if (result == null || result.error() != null) {
            String error = result == null ? "ODOO_REPORT_UNAVAILABLE" : result.error();
            summary = productSearchFailureMessage(error, isChinese(question));
        } else if (result.rows() == null || result.rows().isEmpty()) {
            summary = isChinese(question)
                    ? "商品目录中没有找到与“" + query + "”匹配的商品。"
                    : "No catalogue matches found for \"" + query + "\".";
        } else {
            boolean chinese = isChinese(question);
            String lines = result.rows().stream()
                    .limit(5)
                    .map(row -> productSearchLine(row, chinese))
                    .collect(Collectors.joining("\n"));
            summary = (chinese ? "找到以下商品：\n" : "Matching products:\n") + lines;
        }
        return shortcutResult("search_product", summary, fast.slots(), fast.panel(), fast.view(),
                fast.route(), fast.action());
    }

    private static String productSearchLine(Map<String, Object> row, boolean chinese) {
        String name = String.valueOf(row.getOrDefault("name", "")).trim();
        if (name.isBlank()) name = chinese ? "未命名商品" : "Unnamed product";
        Object price = row.get("list_price");
        Object quantity = row.get("quantity");
        String priceLabel = price == null ? "" : (chinese ? "售价 $" : "$") + price;
        String stockLabel = quantity == null ? "" : (chinese ? "库存 " : "stock ") + quantity;
        String details = java.util.stream.Stream.of(priceLabel, stockLabel)
                .filter(value -> !value.isBlank())
                .collect(Collectors.joining(" · "));
        return details.isBlank() ? "• " + name : "• " + name + " — " + details;
    }

    private static String productSearchFailureMessage(String error, boolean chinese) {
        return switch (error == null ? "" : error) {
            case "NO_STORE", "NO_OUTLET" -> chinese
                    ? "当前账号未绑定门店，暂时无法查询商品。"
                    : "This account is not bound to a store, so products cannot be searched.";
            case "NO_PERMISSION" -> chinese
                    ? "当前账号没有权限查询商品，请联系管理员检查门店权限。"
                    : "This account does not have permission to search products.";
            case "NEED_PRODUCT" -> chinese
                    ? "请提供商品名称或条码，我再帮你查找。"
                    : "Tell me a product name or barcode to search for.";
            case "ODOO_REPORT_NOT_CONFIGURED", "ODOO_REPORT_STORE_UNLINKED" -> chinese
                    ? "当前门店的 Odoo 商品目录不可用，请稍后重试或打开商品目录。"
                    : "The Odoo product catalogue is unavailable for this store. Please try again or open Products.";
            default -> chinese
                    ? "暂时无法查询商品目录，请稍后重试或打开商品目录。"
                    : "The product catalogue is unavailable right now. Please try again or open Products.";
        };
    }

    private static String productCountSummary(int count, boolean chinese) {
        return chinese
                ? "本店商品目录共有 " + count + " 个可售商品。"
                : "This store has " + count + " sellable products in the catalogue.";
    }

    private static String productCountFailureMessage(String error, boolean chinese) {
        return switch (error == null ? "" : error) {
            case "NO_PERMISSION" -> chinese
                    ? "你没有权限查询实时商品总数。"
                    : "You do not have permission to query the live product total.";
            case "NO_OUTLET" -> chinese
                    ? "当前账号尚未绑定门店，暂时无法查询实时商品总数。"
                    : "Your account is not bound to a store, so the live product total is unavailable.";
            case "ODOO_REPORT_NOT_CONFIGURED" -> chinese
                    ? "当前门店尚未配置 Odoo，暂时无法获取商品总数。"
                    : "Odoo is not configured for this store, so the live product total is unavailable.";
            case "ODOO_REPORT_STORE_UNLINKED" -> chinese
                    ? "当前门店尚未连接 Odoo，暂时无法获取商品总数。"
                    : "This store is not linked to Odoo, so the live product total is unavailable.";
            default -> chinese
                    ? "当前暂时无法获取商品总数，请稍后重试。"
                    : "Live product count is unavailable right now. Please try again shortly.";
        };
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }

    private static boolean isProductCountUtterance(String question) {
        if (question == null) {
            return false;
        }
        String q = question.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[\\u3000\\s]+", " ")
                .replace('？', '?')
                .replace('！', '!')
                .replace('。', '.');
        return q.matches(".*(?:有多少(?:个)?(?:产品|商品)|(?:产品|商品)(?:一共|总共|总数|数量)(?:有多少|是多少)?|(?:产品|商品)(?:现在)?(?:有多少(?:个|种)?|有几(?:个|种))|一共有多少(?:个)?(?:产品|商品)|(?:产品|商品)有几种|有几种(?:产品|商品)|(?:产品|商品)总共有多少|(?:店里|目录|商品目录)?(?:有多少种|一共有多少种|总共有多少种)(?:产品|商品)|(?:目录|商品目录)(?:里)?(?:有多少|共有多少)(?:个)?(?:商品|产品)?|(?:sku|商品)总数(?:是多少|有多少)?).*[?!.]?$")
                || q.matches(".*(?:我们|店里|门店|本店)(?:店里)?(?:现在)?(?:一共|总共)?有多少(?:个|种)?(?:产品|商品).*[?!.]?$")
                || q.matches(".*(?:how many|number of|what(?:'s| is) the number of|total number of) (?:our )?(?:products?|items?|skus?)(?: do we have(?: in (?:our |the )?(?:(?:product )?catalog(?:ue)?|store|shop))?| are there| do we stock| we stock| in (?:our |the )?(?:(?:product )?catalog(?:ue)?|store|shop)| (?:are|is) in (?:our |the )?(?:(?:product )?catalog(?:ue)?|store|shop))?[?!.]?$" )
                || q.matches(".*how many (?:products?|items?|skus?) (?:are|is) (?:in|on) (?:the )?(?:product )?catalog(?:ue)?[?!.]?$")
                || q.matches(".*how many (?:products?|items?|skus?) (?:in|on) (?:our |the )?(?:(?:product )?catalog(?:ue)?|store|shop)[?!.]?$")
                || q.matches(".*(?:what(?:'s| is) (?:our )?product count|total products? count|total number of products?)[?!.]?$")
                || q.contains("product count") || q.contains("total products")
                || q.contains("catalogue size") || q.contains("catalog size");
    }

    private static Map<String, Object> shortcutResult(
            String intent,
            String summary,
            Map<String, String> slots,
            String panel,
            String view,
            String route,
            String action) {
        Map<String, Object> out = new HashMap<>();
        out.put("intent", intent);
        out.put("intent_summary", summary);
        out.put("slots", slots == null ? Map.of() : slots);
        out.put("ui_panel", nullToEmpty(panel));
        out.put("ui_view", nullToEmpty(view));
        out.put("ui_route", nullToEmpty(route));
        out.put("ui_action", nullToEmpty(action));
        out.put("fast_path_id", intent == null || intent.isBlank() ? "unknown" : intent);
        out.put("route_source", "deterministic");
        out.put("llm_fallback", false);
        return out;
    }

    OpenAiChatOptions classifyOptions() {
        return classifyOptions(properties);
    }

    static OpenAiChatOptions classifyOptions(AiProperties properties) {
        var builder = OpenAiChatOptions.builder()
                .temperature(properties.temperature())
                .maxTokens(Math.min(512, properties.maxTokens()));
        String classifyModel = properties.classifyModel();
        if (classifyModel != null && !classifyModel.isBlank()) {
            String model = classifyModel.trim();
            builder.model(model);
        }
        return builder.build();
    }

    private RawIntent callModel(String system, String userPrompt, AiTenantContext tenant) {
        if (aiGateway != null && tenant != null) {
            AiCompletion<String> completion = aiGateway.complete(tenant, AiTask.CLASSIFICATION,
                    new PromptVersion(IntentConfigService.PROMPT_CLASSIFY, "runtime", ""),
                    system + "\n\n" + userPrompt, String.class);
            RawIntent parsed = parseRawJson(completion.value());
            if (parsed.intent() != null && !parsed.intent().isBlank()) {
                return parsed;
            }
            throw new IllegalStateException("AI gateway returned invalid classify output");
        }
            // Prefer plain JSON text for consistent structured output across remote models.
        try {
            String raw = chatClient.prompt()
                    .system(system)
                    .user(userPrompt)
                    .options(classifyOptions())
                    .call()
                    .content();
            RawIntent parsed = parseRawJson(raw);
            if (parsed.intent() != null && !parsed.intent().isBlank()) {
                return parsed;
            }
        } catch (Exception e) {
            log.warn("Intent classify call failed type={}", e.getClass().getSimpleName());
            throw e;
        }

        try {
            LlmIntentOutput entity = chatClient.prompt()
                    .system(system)
                    .user(userPrompt)
                    .options(classifyOptions())
                    .call()
                    .entity(LlmIntentOutput.class);
            if (entity != null && entity.intent() != null) {
                return new RawIntent(
                        entity.intent(),
                        entity.summary(),
                        entity.query(),
                        entity.route(),
                        entity.view(),
                        entity.panel(),
                        entity.action(),
                        entity.entity(),
                        entity.op(),
                        entity.from(),
                        entity.to(),
                        entity.days(),
                        entity.category()
                );
            }
        } catch (Exception e) {
            log.warn("Structured intent parse failed type={}", e.getClass().getSimpleName());
        }

        return new RawIntent("unknown", "model returned empty intent",
                null, null, null, null, null, null, null, null, null, null, null);
    }

    private static AiTenantContext tenantContext(OverAllState state) {
        long vendor = state.value("vendor_id", Number.class).map(Number::longValue).orElse(0L);
        long user = state.value("user_id", Number.class).map(Number::longValue).orElse(0L);
        long outlet = state.value("outlet_id", Number.class).map(Number::longValue).orElse(0L);
        if (vendor <= 0 || user <= 0 || outlet <= 0) return null;
        String correlation = state.value(com.orithos.config.CorrelationIdContext.STATE_KEY, String.class).orElse("unknown");
        return new AiTenantContext(vendor, outlet, user, correlation);
    }

    private static String buildUserPrompt(IntentConfigService.Snapshot snap, String question,
                                          String history, String storeContext) {
        String intentLines = snap.intents().stream()
                .map(i -> "- " + i.getCode() + ": " + hint(i))
                .collect(Collectors.joining("\n"));

        StringBuilder slotLines = new StringBuilder();
        for (AiSlot slot : snap.slots()) {
            if (!snap.isLlmSlot(slot)) {
                continue;
            }
            slotLines.append("- ").append(slot.getCode())
                    .append(" (").append(slot.getValueType()).append(")");
            if (slot.getDescription() != null) {
                slotLines.append(": ").append(slot.getDescription());
            }
            if ("enum".equalsIgnoreCase(slot.getValueType())) {
                slotLines.append("\n  allowed: ").append(String.join(", ", allowedDisplay(snap, slot.getCode())));
            }
            slotLines.append('\n');
        }

        String historyBlock = (history == null || history.isBlank())
                ? ""
                : "Recent conversation (for relative follow-ups like \"and yesterday?\"):\n" + history + "\n\n";
        String contextBlock = (storeContext == null || storeContext.isBlank())
                ? ""
                : storeContext.trim() + "\n\n";

        return """
                Allowed intents:
                %s

                Allowed slots:
                %s
                %s%sUser utterance:
                """
                .formatted(intentLines, slotLines, contextBlock, historyBlock)
                + """
                ---
                %s
                ---

                Reply with JSON only:
                {"intent":"...","summary":"one-line","query":null,"route":null,"view":null,"panel":null,"action":null,"entity":null,"op":null,"from":null,"to":null,"days":null,"category":null}
                Use null for unused slots. Use entity_action only for read-only list/search/view requests. Any create, edit, delete, import, receive, save, confirm, price change, or inventory adjustment must use guided_action with a page route; the assistant never writes business data.
                Creating a user/customer (创建一个用户/客户) → intent guided_action, entity=customer, op=create (query optional; page collects required fields and user confirms Save).
                Creating a product (创建商品/产品) → intent guided_action, entity=product, op=create (query optional; page collects required fields and user confirms Save).
                For sales/quantity/stock/dead-stock/average-ticket questions use report_* intents (not qa). Dates as YYYY-MM-DD when known.
                Ticket counts (几笔订单 / how many tickets) → report_aov (tickets field). Rankings / mixed metrics / day-vs-day → report_adhoc.
                Prefer the nearest report_* template over report_adhoc when one fits.
                For route prefer path like /orders or key like orders from allowed list.
                """.formatted(question);
    }

    private static String hint(AiIntent i) {
        if (i.getPromptHint() != null && !i.getPromptHint().isBlank()) {
            return i.getPromptHint();
        }
        return i.getDescription() != null ? i.getDescription() : i.getName();
    }

    private static List<String> allowedDisplay(IntentConfigService.Snapshot snap, String slotCode) {
        return snap.enumValues(slotCode).values().stream().distinct().sorted().limit(80).toList();
    }

    private static RawIntent parseRawJson(String raw) {
        if (raw == null) {
            return new RawIntent("unknown", "empty model response",
                    null, null, null, null, null, null, null, null, null, null, null);
        }
        return new RawIntent(
                extract(raw, "intent"),
                extract(raw, "summary"),
                extract(raw, "query"),
                extract(raw, "route"),
                extract(raw, "view"),
                extract(raw, "panel"),
                extract(raw, "action"),
                extract(raw, "entity"),
                extract(raw, "op"),
                extract(raw, "from"),
                extract(raw, "to"),
                extract(raw, "days"),
                extract(raw, "category")
        );
    }

    private static String extract(String raw, String field) {
        Pattern p = Pattern.compile("\"" + field + "\"\\s*:\\s*(\"(?:\\\\.|[^\"])*\"|null)", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(raw);
        if (!m.find()) return null;
        String v = m.group(1);
        if (v == null || "null".equalsIgnoreCase(v)) return null;
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
            return v.substring(1, v.length() - 1);
        }
        return v;
    }

    private static String nullToEmpty(String v) {
        return v == null ? "" : v;
    }

    /** Structured LLM output for Phase A classify. */
    public record LlmIntentOutput(
            String intent,
            String summary,
            String query,
            String route,
            String view,
            String panel,
            String action,
            String entity,
            String op,
            String from,
            String to,
            String days,
            String category
    ) {}
}
