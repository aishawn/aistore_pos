package com.orithos.modules.ai.node;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.ai.configstore.AiIntent;
import com.orithos.modules.ai.configstore.AiSlot;
import com.orithos.modules.ai.configstore.IntentConfigService;
import com.orithos.modules.ai.configstore.IntentSanitizeService;
import com.orithos.modules.ai.configstore.IntentSanitizeService.RawIntent;
import com.orithos.modules.ai.configstore.IntentSanitizeService.SanitizedIntent;
import com.orithos.modules.ai.report.ReportAdhocRouter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Phase A: classify utterance using DB-backed prompt + whitelist, then sanitize slots.
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

    public ClassifyQueryNode(ChatClient chatClient,
                             IntentConfigService configService,
                             IntentSanitizeService sanitizeService) {
        this.chatClient = chatClient;
        this.configService = configService;
        this.sanitizeService = sanitizeService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));

        IntentConfigService.Snapshot snap = configService.getSnapshot();
        String system = snap.promptContent(IntentConfigService.PROMPT_CLASSIFY, FALLBACK_CLASSIFY_PROMPT);
        String userPrompt = buildUserPrompt(snap, question);

        RawIntent raw = callModel(system, userPrompt);
        SanitizedIntent result = sanitizeService.sanitize(raw);
        String intent = ReportAdhocRouter.maybeOverride(question, result.intent());
        if (intent != null && !intent.equals(result.intent())) {
            log.info("Forced intent {} -> {} for NL2SQL", result.intent(), intent);
        }

        log.debug("Classified intent={}", intent);

        Map<String, Object> out = new HashMap<>();
        out.put("intent", intent);
        out.put("intent_summary", result.summary());
        out.put("slots", result.slots());
        out.put("ui_panel", nullToEmpty(result.panel()));
        out.put("ui_view", nullToEmpty(result.view()));
        out.put("ui_route", nullToEmpty(result.route()));
        out.put("ui_action", nullToEmpty(result.action()));
        return out;
    }

    private RawIntent callModel(String system, String userPrompt) {
        // Prefer plain JSON text: more reliable across DashScope models than BeanOutputConverter/entity().
        try {
            String raw = chatClient.prompt()
                    .system(system)
                    .user(userPrompt)
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

    private static String buildUserPrompt(IntentConfigService.Snapshot snap, String question) {
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

        return """
                Allowed intents:
                %s

                Allowed slots:
                %s
                User utterance:
                """
                .formatted(intentLines, slotLines)
                + """
                ---
                %s
                ---

                Reply with JSON only:
                {"intent":"...","summary":"one-line","query":null,"route":null,"view":null,"panel":null,"action":null,"entity":null,"op":null,"from":null,"to":null,"days":null,"category":null}
                Use null for unused slots. For Inventory/Customer CRUD use intent entity_action with entity+op (+query for search/edit/delete).
                Creating a user/customer (创建一个用户/客户) → intent entity_action, entity=customer, op=create (query optional; client prefills required fields).
                Creating a product (创建商品/产品) → intent entity_action, entity=product, op=create (query optional; client prefills required fields, user clicks Save).
                For sales/quantity/stock/dead-stock/average-ticket questions use report_* intents (not qa). Dates as YYYY-MM-DD when known.
                Ticket counts (几笔订单 / how many tickets), mixed metrics, rankings, and day-vs-day comparisons MUST use report_adhoc, not report_qty.
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
