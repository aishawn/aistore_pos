package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.AssistantFastPathRouter;
import com.orithos.modules.ai.AssistantTenantContext;
import com.orithos.modules.ai.DashScopeModelRouting;
import com.orithos.modules.ai.WorkflowRouteRouter;
import com.orithos.modules.ai.configstore.AiIntent;
import com.orithos.modules.ai.configstore.AiSlot;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.configstore.IntentSanitizeService.RawIntent;
import com.orithos.modules.ai.configstore.IntentSanitizeService.SanitizedIntent;
import com.orithos.modules.ai.context.FollowUpSupport;
import com.orithos.modules.ai.pricing.PricingChatBrief;
import com.orithos.modules.ai.replenishment.ReplenishmentChatBrief;
import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.ReportAdhocRouter;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.SommelierChatBrief;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;

import java.util.HashMap;
import java.util.List;
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
        this.chatClient = chatClient;
        this.configService = configService;
        this.sanitizeService = sanitizeService;
        this.properties = properties;
        this.reportQueryService = reportQueryService;
        this.sommelierChatBrief = sommelierChatBrief;
        this.replenishmentChatBrief = replenishmentChatBrief;
        this.pricingChatBrief = pricingChatBrief;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));
        String lastIntent = optionalString(state, "last_intent");
        Map<String, String> lastSlots = optionalStringMap(state, "last_slots");

        // Explicit write requests must never reach a shortcut or the model.
        // Both paths can otherwise produce a harmless-looking read-only route
        // for words such as “submit”, “save” or “receive”.
        if (WorkflowRouteRouter.hasWriteIntent(question)) {
            log.info("Write-intent request kept in guided flow");
            boolean stockTarget = isStockWriteTarget(question);
            boolean priceTarget = isPriceWriteTarget(question);
            String writeRoute = isInvoiceWriteTarget(question) ? "/invoices/scan"
                    : (stockTarget || isStockMutationTarget(question)) ? "/stock/replenishment"
                    : priceTarget ? "/stock/capped-pricing"
                    : isCustomerWriteTarget(question) ? "/customers"
                    : isProductWriteTarget(question) ? "/products"
                    : isSupplierWriteTarget(question) ? "/suppliers/odoo"
                    : isOrderWriteTarget(question) ? "/orders" : "";
            String summary = stockTarget
                    ? "I cannot change stock quantities from chat. Open replenishment yourself to review suggestions and confirm any order on the page."
                    : priceTarget
                    ? "I cannot change prices from chat. Open price review yourself to check suggestions and confirm any change on the page."
                    : "I can help review this, but I cannot perform that business action from chat.";
            return shortcutResult(
                    "guided_action",
                    summary,
                    Map.of(), "", "", writeRoute, "");
        }

        // Relative follow-ups reuse the previous report intent ("and yesterday?").
        if (FollowUpSupport.isRelativeFollowUp(question)
                && FollowUpSupport.isReportIntent(lastIntent)
                && !"report_adhoc".equals(lastIntent)) {
            log.info("Follow-up fast-path intent={}", lastIntent);
            Map<String, String> slots = FollowUpSupport.mergeMissingSlots(Map.of(), lastSlots);
            return shortcutResult(lastIntent, "Follow-up report", slots, "", "", "", "");
        }

        // Product catalogue count before other product lookup shortcuts.
        if (isProductCountUtterance(question)) {
            log.info("Product-count fast-path (skipped classify LLM)");
            return productCountShortcut(new AssistantFastPathRouter.Match(
                    "product_count",
                    "Live product count is unavailable right now. Open Products to browse or try again shortly.",
                    Map.of(),
                    "/products",
                    "products",
                    "",
                    ""));
        }

        // Explicit unsupported comparisons should keep their guided refusal even
        // when a date or metric token also matches a supported report shortcut.
        if (ReportAdhocRouter.shouldUseNl2Sql(question)) {
            log.info("Ad-hoc report fast-path (skipped classify LLM)");
            return shortcutResult(
                    "report_adhoc",
                    "This custom report is not available yet.",
                    Map.of(), "", "", writeRoute, "");
        }

        AssistantFastPathRouter.Match fast = AssistantFastPathRouter.maybeMatch(question);
        if (fast != null) {
            log.info("Fast-path intent={} (skipped classify LLM)", fast.intent());
            return shortcutResult(fast.intent(), fast.summary(), fast.slots(), fast.panel(), fast.view(),
                    fast.route(), fast.action());
        }

        // Explicit workflow requests are deterministic navigation intents. Resolve
        // them before the classifier so a temporary provider outage cannot block
        // safe replenishment, pricing, sommelier or invoice preview navigation.
        WorkflowRouteRouter.Override directWorkflow = WorkflowRouteRouter.maybeOverride(question);
        if (directWorkflow != null) {
            log.info("Workflow fast-path route={}", directWorkflow.route());
            Map<String, Object> out = new HashMap<>();
            out.put("intent", directWorkflow.intent());
            out.put("intent_summary", workflowChatSummary(directWorkflow.route(), question));
            out.put("slots", Map.of());
            out.put("ui_panel", "");
            out.put("ui_view", "");
            out.put("ui_route", directWorkflow.route());
            out.put("ui_action", "");
            return out;
        }

        IntentConfigService.Snapshot snap = configService.getSnapshot();
        String system = snap.promptContent(IntentConfigService.PROMPT_CLASSIFY, FALLBACK_CLASSIFY_PROMPT);
        String history = optionalString(state, "conversation_history");
        String storeContext = optionalString(state, "store_context");
        String userPrompt = buildUserPrompt(snap, question, history, storeContext);

        RawIntent raw = callModel(system, userPrompt);
        SanitizedIntent result = sanitizeService.sanitize(raw);
        if (isWriteEntityResult(result)) {
            return shortcutResult("guided_action",
                    "I can guide this change, but saving business data must be completed and confirmed on the page.",
                    Map.of(), "", "", guidedRouteForTarget(result.slots().get("entity")), "");
        }
        if ("sale_action".equals(result.intent())
                && ("Create Customer".equalsIgnoreCase(result.action())
                || "Create Product".equalsIgnoreCase(result.action()))) {
            String route = "Create Customer".equalsIgnoreCase(result.action()) ? "/customers" : "/products";
            return shortcutResult("guided_action",
                    "I can guide this creation, but saving business data must be completed and confirmed on the page.",
                    Map.of(), "", "", route, "");
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

        Map<String, String> slots = FollowUpSupport.mergeMissingSlots(result.slots(), lastSlots);
        String summary = result.summary();
        if ("/sommelier".equals(route) || "/stock/replenishment".equals(route)
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

    private static boolean isStockWriteTarget(String question) {
        if (question == null) {
            return false;
        }
        return question.matches(
                "(?is).*(?:把.+?(?:补到|补足|补至|加到)\\s*\\d+"
                        + "|(?:top up|restock|replenish|bring)\\b.+?(?:to|up to)\\s*\\d+"
                        + "|\\border\\s+\\d+\\s+(?:units?|bottles?|cases?)\\b).*");
    }

    private static boolean isPriceWriteTarget(String question) {
        if (question == null) {
            return false;
        }
        return question.matches(
                "(?is).*(?:把.+?(?:价格|售价)\\s*(?:改成|调整为|设为)\\s*\\$?\\d+"
                        + "|\\b(?:set|change|raise|lower)\\b.+?\\b(?:price|to)\\b\\s*\\$?\\d+).*");
    }

    private static boolean isCustomerWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:customer|client|客户|顾客).*");
    }

    private static boolean isProductWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:product|item|catalogue|catalog|产品|商品).*");
    }

    private static boolean isStockMutationTarget(String question) {
        return question != null && question.matches("(?is).*(?:stock|inventory|receive|收货|库存|盘点).*");
    }

    private static boolean isInvoiceWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:invoice|bill|发票|账单).*");
    }

    private static boolean isOrderWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:order|purchase|采购|订单).*");
    }

    private static boolean isSupplierWriteTarget(String question) {
        return question != null && question.matches("(?is).*(?:supplier|vendor|供应商).*");
    }

    private static boolean isWriteEntityResult(SanitizedIntent result) {
        if (result == null || !"entity_action".equals(result.intent())) return false;
        String op = result.slots().get("op");
        return op != null && op.matches("(?i)(create|add|edit|update|delete|remove|merge|import|upload|receive|return|transfer|adjust|confirm|approve|save|submit|send|publish)");
    }

    private static String guidedRouteForTarget(String target) {
        if (target == null) return "";
        return switch (target.toLowerCase(java.util.Locale.ROOT)) {
            case "customer", "client" -> "/customers";
            case "product", "item", "catalogue", "catalog" -> "/products";
            case "invoice", "bill" -> "/invoices/scan";
            case "supplier", "vendor" -> "/suppliers/odoo";
            case "order", "purchase" -> "/orders";
            case "stock", "inventory" -> "/stock/replenishment";
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

    private Map<String, Object> productCountShortcut(AssistantFastPathRouter.Match fast) {
        TenantContext tenant = AssistantTenantContext.get();
        if (tenant == null) {
            return shortcutResult("product_count",
                    "Sign in to a store to read the live product total. Open Products to browse.",
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        if (tenant.requireOutletId() == null) {
            return shortcutResult("product_count",
                    "Your account is not bound to a store, so the live product total is unavailable. Open Products to check the catalogue.",
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        if (!tenant.canQueryReport()) {
            return shortcutResult("product_count",
                    "You do not have permission to query the live product total. Open Products to browse the catalogue.",
                    Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
        }
        Integer count = null;
        if (reportQueryService != null) {
            count = reportQueryService.countSellableProducts(tenant);
        }
        String summary = count != null
                ? "This store has " + count + " sellable products in the catalogue. Open Products to browse."
                : "Live product count is unavailable right now. Open Products to browse or try again shortly.";
        return shortcutResult("product_count", summary, Map.of(), fast.panel(), fast.view(), fast.route(), fast.action());
    }

    private static boolean isProductCountUtterance(String question) {
        if (question == null) {
            return false;
        }
        String q = question.trim().toLowerCase();
        return q.contains("多少产品") || q.contains("多少商品") || q.contains("产品总数")
                || q.contains("商品总数") || q.contains("how many product") || q.contains("product count")
                || q.contains("total products") || q.contains("how many sku")
                || q.contains("catalogue size") || q.contains("catalog size")
                || q.contains("how many items do we have");
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
        return out;
    }

    DashScopeChatOptions classifyOptions() {
        return classifyOptions(properties);
    }

    static DashScopeChatOptions classifyOptions(AiProperties properties) {
        var builder = DashScopeChatOptions.builder()
                .temperature(properties.temperature())
                .maxToken(Math.min(512, properties.maxTokens()));
        String classifyModel = properties.classifyModel();
        if (classifyModel != null && !classifyModel.isBlank()) {
            String model = classifyModel.trim();
            // DashScope selects its endpoint from this request option, not only the global model config.
            builder.model(model)
                    .multiModel(DashScopeModelRouting.requiresMultimodalEndpoint(model));
        }
        return builder.build();
    }

    private RawIntent callModel(String system, String userPrompt) {
        // Prefer plain JSON text: more reliable across DashScope models than BeanOutputConverter/entity().
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
