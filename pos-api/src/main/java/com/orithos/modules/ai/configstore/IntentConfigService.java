package com.orithos.modules.ai.configstore;

import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Loads intent / slot / prompt whitelist from DB with an in-memory snapshot.
 * Call {@link #invalidate()} after admin CRUD so classify picks up changes.
 */
@Service
public class IntentConfigService {

    public static final String PROMPT_CLASSIFY = "classify_system";
    public static final String PROMPT_RESPOND = "respond_system";
    public static final String PROMPT_NL2SQL = "nl2sql_system";
    /** UI-only slot: Sell search-mode keywords that route input to AI (not LLM extract slots). */
    public static final String SLOT_AI_TRIGGER = "ai_trigger";

    public static final List<String> DEFAULT_AI_TRIGGERS = List.of(
            "find", "search", "open", "show", "go to", "help", "how to", "what", "where",
            "找", "搜一下", "打开", "帮我", "怎么", "查询", "去订单", "结账", "导航",
            "delete", "create", "add", "edit", "update", "remove", "merge", "import", "export",
            "删除", "新建", "添加", "修改", "编辑", "合并"
    );

    private final AiIntentMapper intentMapper;
    private final AiSlotMapper slotMapper;
    private final AiSlotValueMapper slotValueMapper;
    private final AiPromptMapper promptMapper;

    private final AtomicReference<Snapshot> snapshot = new AtomicReference<>(Snapshot.empty());

    public IntentConfigService(AiIntentMapper intentMapper,
                               AiSlotMapper slotMapper,
                               AiSlotValueMapper slotValueMapper,
                               AiPromptMapper promptMapper) {
        this.intentMapper = intentMapper;
        this.slotMapper = slotMapper;
        this.slotValueMapper = slotValueMapper;
        this.promptMapper = promptMapper;
    }

    public Snapshot getSnapshot() {
        Snapshot current = snapshot.get();
        if (current.loaded()) {
            return current;
        }
        synchronized (this) {
            current = snapshot.get();
            if (!current.loaded()) {
                current = reload();
                snapshot.set(current);
            }
            return current;
        }
    }

    public void invalidate() {
        snapshot.set(Snapshot.empty());
    }

    public Snapshot reload() {
        List<AiIntent> intents = safeList(intentMapper::findEnabled);
        List<AiSlot> slots = safeList(slotMapper::findEnabled);
        List<AiSlotValue> values = safeList(slotValueMapper::findEnabled);
        Map<String, AiPrompt> prompts = safeList(promptMapper::findAll).stream()
                .filter(p -> Boolean.TRUE.equals(p.getEnabled()))
                .collect(Collectors.toMap(AiPrompt::getCode, Function.identity(), (a, b) -> a, LinkedHashMap::new));

        Map<String, AiIntent> intentByCode = intents.stream()
                .collect(Collectors.toMap(AiIntent::getCode, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        Map<String, AiSlot> slotByCode = slots.stream()
                .collect(Collectors.toMap(AiSlot::getCode, Function.identity(), (a, b) -> a, LinkedHashMap::new));

        Map<String, Map<String, String>> enumLookup = new LinkedHashMap<>();
        LinkedHashSet<String> aiTriggers = new LinkedHashSet<>();
        for (AiSlotValue v : values) {
            enumLookup
                    .computeIfAbsent(v.getSlotCode(), k -> new LinkedHashMap<>())
                    .put(normalizeKey(v.getValueKey()), v.getValue());
            // also allow matching by the canonical value itself
            enumLookup.get(v.getSlotCode()).put(normalizeKey(v.getValue()), v.getValue());
            if (SLOT_AI_TRIGGER.equals(v.getSlotCode()) && v.getValue() != null && !v.getValue().isBlank()) {
                aiTriggers.add(v.getValue().trim());
            }
        }

        List<String> triggerList = aiTriggers.isEmpty()
                ? List.copyOf(DEFAULT_AI_TRIGGERS)
                : List.copyOf(aiTriggers);

        Snapshot snap = new Snapshot(
                true, intents, intentByCode, slots, slotByCode, enumLookup, prompts, triggerList);
        snapshot.set(snap);
        return snap;
    }

    private static <T> List<T> safeList(java.util.function.Supplier<List<T>> supplier) {
        try {
            List<T> list = supplier.get();
            return list == null ? List.of() : list;
        } catch (Exception e) {
            return List.of();
        }
    }

    static String normalizeKey(String raw) {
        if (raw == null) return "";
        return raw.trim().toLowerCase();
    }

    public record Snapshot(
            boolean loaded,
            List<AiIntent> intents,
            Map<String, AiIntent> intentByCode,
            List<AiSlot> slots,
            Map<String, AiSlot> slotByCode,
            Map<String, Map<String, String>> enumLookup,
            Map<String, AiPrompt> prompts,
            List<String> aiTriggerKeywords
    ) {
        static Snapshot empty() {
            return new Snapshot(
                    false, List.of(), Map.of(), List.of(), Map.of(), Map.of(), Map.of(),
                    List.copyOf(DEFAULT_AI_TRIGGERS));
        }

        public String promptContent(String code, String fallback) {
            AiPrompt p = prompts.get(code);
            if (p == null || p.getContent() == null || p.getContent().isBlank()) {
                return fallback;
            }
            return p.getContent();
        }

        public boolean isKnownIntent(String code) {
            return code != null && intentByCode.containsKey(code);
        }

        public AiIntent intent(String code) {
            return intentByCode.get(code);
        }

        public Map<String, String> enumValues(String slotCode) {
            return enumLookup.getOrDefault(slotCode, Collections.emptyMap());
        }

        public boolean isLlmSlot(AiSlot slot) {
            if (slot == null || slot.getCode() == null) return false;
            if (SLOT_AI_TRIGGER.equals(slot.getCode())) return false;
            return !"keyword".equalsIgnoreCase(slot.getValueType());
        }
    }
}
