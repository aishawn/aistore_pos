package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.AiProperties;
import com.orithos.modules.ai.DashScopeModelRouting;
import com.orithos.modules.ai.PosAssistantTools;
import com.orithos.modules.ai.configstore.IntentConfigService;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Map;
import java.util.Set;

/**
 * Generates a chat answer for qa/unknown; Phase A action intents get a short canned message (no LLM).
 * qa/unknown may use read-only {@link PosAssistantTools} with tenant from {@code AssistantTenantContext}.
 */
public class GenerateResponseNode implements NodeAction {

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

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService,
                                AiProperties properties, PosAssistantTools tools) {
        this(chatClient, configService, properties, tools, "qwen-plus");
    }

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService,
                                AiProperties properties, PosAssistantTools tools, String primaryModel) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.properties = properties;
        this.tools = tools;
        this.primaryModel = primaryModel == null || primaryModel.isBlank() ? "qwen-plus" : primaryModel.trim();
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
        String answer = prompt.call().content();

        return Map.of("answer", answer == null ? "" : answer);
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
