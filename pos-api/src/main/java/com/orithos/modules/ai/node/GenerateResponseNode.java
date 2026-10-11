package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.configstore.IntentConfigService;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Map;
import java.util.Set;

/**
 * Generates a chat answer for qa/unknown; Phase A action intents get a short canned message (no LLM).
 */
public class GenerateResponseNode implements NodeAction {

    private static final Set<String> LLM_INTENTS = Set.of("qa", "unknown");

    private static final String FALLBACK_RESPOND = """
            You are an assistant for the Orithos POS system used by retail staff.
            Answer concisely in the same language as the user.
            When the user asks for live data, explain which screen to use instead of inventing numbers.
            """;

    private final ChatClient chatClient;
    private final IntentConfigService configService;

    public GenerateResponseNode(ChatClient chatClient, IntentConfigService configService) {
        this.chatClient = chatClient;
        this.configService = configService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));
        String intent = state.value("intent", String.class).orElse("unknown");
        String summary = state.value("intent_summary", String.class).orElse("");

        if (!LLM_INTENTS.contains(intent)) {
            return Map.of("answer", cannedAnswer(intent, summary));
        }

        String system = configService.getSnapshot()
                .promptContent(IntentConfigService.PROMPT_RESPOND, FALLBACK_RESPOND);

        String userPrompt = """
                Intent: %s
                Intent summary: %s
                Question: %s
                """.formatted(intent, summary, question);

        String answer = chatClient.prompt()
                .system(system)
                .user(userPrompt)
                .call()
                .content();

        return Map.of("answer", answer == null ? "" : answer);
    }

    private static String cannedAnswer(String intent, String summary) {
        if (summary != null && !summary.isBlank()) {
            return summary;
        }
        return switch (intent) {
            case "search_product", "search_customer" -> "Searching…";
            case "navigate" -> "Opening…";
            case "sale_action" -> "Confirm the suggested action to continue.";
            default -> "OK";
        };
    }
}
