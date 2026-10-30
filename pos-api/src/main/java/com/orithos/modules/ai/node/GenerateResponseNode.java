package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.DashScopeModelRouting;
import com.orithos.modules.ai.PosAssistantTools;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import org.springframework.ai.chat.client.ChatClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.Set;

/**
 * Generates a chat answer for qa/unknown; Phase A action intents get a short canned message (no LLM).
 * qa/unknown may use read-only {@link PosAssistantTools} with tenant from {@code AssistantTenantContext}.
 */
public class GenerateResponseNode implements NodeAction {

    private static final Logger log = LoggerFactory.getLogger(GenerateResponseNode.class);

    private static final Set<String> LLM_INTENTS = Set.of("qa", "unknown");

    private static final String FALLBACK_RESPOND = """
            You are an assistant for the Orithos POS system used by retail staff.
            Answer concisely in the same language as the user.
            When live numbers are needed, call the provided tools. Never invent sales, stock, or prices.
            If tools are unavailable, explain which screen to use instead.
            """;

    private final ChatClient chatClient;
    private final IntentConfigService configService;
    private final AiProperties properties;
    private final PosAssistantTools tools;
    private final String primaryModel;
    private final AiGateway aiGateway;

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService,
                                AiProperties properties, PosAssistantTools tools) {
        this(chatClient, configService, properties, tools, "qwen-plus", null);
    }

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService,
                                AiProperties properties, PosAssistantTools tools, String primaryModel) {
        this(chatClient, configService, properties, tools, primaryModel, null);
    }

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService,
                                AiProperties properties, PosAssistantTools tools, String primaryModel, AiGateway aiGateway) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.properties = properties;
        this.tools = tools;
        this.primaryModel = primaryModel == null || primaryModel.isBlank() ? "qwen-plus" : primaryModel.trim();
        this.aiGateway = aiGateway;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));
        String intent = state.value("intent", String.class).orElse("unknown");
        String summary = state.value("intent_summary", String.class).orElse("");
        String fastPathId = state.value("fast_path_id", String.class).orElse("");

        if ("historical_stock_unavailable".equals(fastPathId)) {
            return Map.of("answer", summary);
        }

        if (!LLM_INTENTS.contains(intent)) {
            return Map.of("answer", cannedAnswer(intent, summary, question));
        }

        String system = configService.getSnapshot()
                .promptContent(IntentConfigService.PROMPT_RESPOND, FALLBACK_RESPOND);
        String history = state.value("conversation_history", String.class).orElse("");
        String storeContext = state.value("store_context", String.class).orElse("");

        String userPrompt = """
                %sIntent: %s
                Intent summary: %s
                %sQuestion: %s
                """.formatted(
                storeContext == null || storeContext.isBlank() ? "" : storeContext.trim() + "\n\n",
                intent,
                summary,
                history == null || history.isBlank() ? "" : "Recent conversation:\n" + history + "\n",
                question);

        var prompt = chatClient.prompt()
                .system(system)
                .user(userPrompt)
                .options(DashScopeChatOptions.builder()
                        .model(primaryModel)
                        .multiModel(DashScopeModelRouting.requiresMultimodalEndpoint(primaryModel))
                        .temperature(properties.temperature())
                        .maxToken(properties.maxTokens())
                        .build());
        if (tools != null) {
            prompt = prompt.tools(tools);
        }
        String answer;
        try {
            if (aiGateway != null) {
                long vendor = state.value("vendor_id", Number.class).map(Number::longValue).orElse(0L);
                long user = state.value("user_id", Number.class).map(Number::longValue).orElse(0L);
                long outlet = state.value("outlet_id", Number.class).map(Number::longValue).orElse(0L);
                if (vendor <= 0 || user <= 0 || outlet <= 0) throw new IllegalStateException("AI tenant scope unavailable");
                String correlation = state.value(com.orithos.config.CorrelationIdContext.STATE_KEY, String.class).orElse("unknown");
                var completion = aiGateway.completeWithTools(new AiTenantContext(vendor, outlet, user, correlation),
                        AiTask.RESPONSE, new PromptVersion(IntentConfigService.PROMPT_RESPOND, "runtime", ""),
                        userPrompt, system, tools == null ? new Object[0] : new Object[]{tools});
                answer = completion.value();
            } else {
                answer = prompt.call().content();
            }
        } catch (RuntimeException failure) {
            // A provider outage must leave the assistant usable. Keep the fallback
            // deterministic and avoid logging the staff member's question.
            log.warn("AI response provider unavailable; using deterministic fallback");
            answer = deterministicFallback(question, intent);
        }

        return Map.of("answer", answer == null ? "" : answer);
    }

    private static String deterministicFallback(String question, String intent) {
        boolean chinese = isChinese(question);
        String normalized = question == null ? "" : question.trim().toLowerCase();
        if (normalized.matches(".*(?:/admin/|/internal/|ignore previous|previous instructions|越权|管理员页面).*")) {
            return chinese
                    ? "我不能打开未授权页面。请从当前门店菜单选择你有权限的功能。"
                    : "I cannot open an unauthorised page. Please choose an available function from this store menu.";
        }
        if (normalized.matches(".*(?:close the register|close the till|cash up|结算收银机|关闭收银机|cashier close).*")) {
            return chinese
                    ? "请打开关班页面，先核对现金和付款汇总，再由有权限的员工确认关班。"
                    : "Open Close Register, check the cash and payment totals, then have an authorised staff member confirm the close.";
        }
        if (normalized.matches(".*(?:what can you do|capabilities|how can you help|你能做什么|你能干什么).*")) {
            return chinese
                    ? "我可以帮助查商品、库存、销售报表、顾客和门店流程，也可以打开推荐、补货、定价和供应商发票页面。"
                    : "I can help with products, stock, sales reports, customers, and POS workflows, and open recommendation, replenishment, pricing, and supplier invoice pages.";
        }
        if (normalized.matches(".*(?:recommend|suggest).*(?:wine|product|grocery|beer|snack)|.*(?:推荐|建议).*(?:酒|商品|杂货|啤酒|零食).*")) {
            return chinese
                    ? "我可以根据顾客的预算、场景和偏好推荐本店有库存的商品，请打开 Recommend。"
                    : "I can recommend in-stock products using the customer’s budget, occasion, and preferences. Open Recommend to begin.";
        }
        if (normalized.matches(".*(?:stock|inventory|库存|存货|商品(?:没有|没|不)显示|查不到库存|查不到|找不到|没有结果|什么都查不到|什么也查不到|find anything|nothing (?:found|comes up|is showing)|no results).*")) {
            return chinese
                    ? "请提供具体商品名称或条码，再打开库存或补货页面查看当前门店数据；AI 不会编造库存数量。"
                    : "Please provide the exact product name or barcode, then open Stock or Replenishment to check the current store data. AI will not invent stock quantities.";
        }
        if (normalized.matches(".*(?:directly|automatically|submit|place|change|read).*"
                + "(?:order|purchase|price|invoice|bill)|.*(?:自动|直接|提交|下单|改价|识别).*")) {
            return chinese
                    ? "AI 只会生成建议或草稿。采购、改价和发票收货仍需要你在对应页面核对并确认。"
                    : "AI only prepares suggestions or drafts. Purchasing, price changes, and invoice receiving still require review and confirmation on their pages.";
        }
        if ("unknown".equals(intent) || normalized.matches("(?:asdfghjkl|qwerty|test|测试)")) {
            return chinese
                    ? "我可以帮你查商品、库存、销售、顾客，或打开推荐和采购页面。请告诉我你想完成什么。"
                    : "I can help with products, stock, sales, customers, or opening recommendation and purchasing pages. Tell me what you want to finish.";
        }
        return chinese
                ? "AI 暂时不可用。请打开对应的商品、库存、报表或采购页面继续操作。"
                : "AI is temporarily unavailable. Open the relevant products, stock, reports, or purchasing page to continue.";
    }

    private static String cannedAnswer(String intent, String summary, String question) {
        if (summary != null && !summary.isBlank()) {
            if ("product_count".equals(intent)) {
                return summary.replaceFirst(
                        "(?i)\\s*(?:open products to browse(?: the catalogue)?|打开商品(?:页|目录)查看(?:目录)?)[。.!！]*\\s*$",
                        "").trim();
            }
            return summary;
        }
        return switch (intent) {
            case "search_product", "search_customer" -> "Searching…";
            case "navigate" -> "Opening…";
            case "sale_action" -> "Confirm the suggested action to continue.";
            case "product_count" -> isChinese(question)
                    ? "暂时无法获取实时商品总数，请稍后重试。"
                    : "Live product count is unavailable right now. Please try again shortly.";
            default -> "OK";
        };
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }
}
