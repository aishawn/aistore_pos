package com.orithos.modules.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Redis-backed recent turns for a vendor:user:session thread. Used to resolve
 * follow-ups like "and yesterday?" without inventing numbers from prior answers.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class AiConversationMemory {

    private static final Logger log = LoggerFactory.getLogger(AiConversationMemory.class);
    private static final String KEY_PREFIX = "ai:chat:";
    private static final String SLOTS_PREFIX = "ai:slots:";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AiProperties properties;

    public AiConversationMemory(StringRedisTemplate redis, ObjectMapper objectMapper, AiProperties properties) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public String formatHistory(String threadId) {
        List<Turn> turns = load(threadId);
        if (turns.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Turn turn : turns) {
            sb.append("User: ").append(turn.question()).append('\n');
            if (turn.answer() != null && !turn.answer().isBlank()) {
                sb.append("Assistant (").append(turn.intent() == null ? "?" : turn.intent())
                        .append("): ").append(trim(turn.answer(), 240)).append('\n');
            }
        }
        return sb.toString().trim();
    }

    public void append(String threadId, String question, String intent, String answer) {
        append(threadId, question, intent, answer, Map.of());
    }

    /** Append a turn and retain sanitized structured slots for thread recovery. */
    public void append(String threadId, String question, String intent, String answer,
                       Map<String, String> slots) {
        if (threadId == null || threadId.isBlank() || question == null || question.isBlank()) {
            return;
        }
        List<Turn> turns = load(threadId);
        turns.add(new Turn(question.trim(), intent == null ? "" : intent,
                answer == null ? "" : answer.trim(), slots));
        int max = properties.conversationMemoryTurns();
        while (turns.size() > max) {
            turns.remove(0);
        }
        try {
            String json = objectMapper.writeValueAsString(turns);
            redis.opsForValue().set(key(threadId), json,
                    Duration.ofMinutes(properties.conversationMemoryTtlMinutes()));
        } catch (Exception e) {
            log.warn("AI conversation memory write failed type={}", e.getClass().getSimpleName());
        }
    }

    public void clear(String threadId) {
        if (threadId == null || threadId.isBlank()) {
            return;
        }
        try {
            redis.delete(key(threadId));
            redis.delete(slotsKey(threadId));
        } catch (Exception e) {
            log.warn("AI conversation memory clear failed type={}", e.getClass().getSimpleName());
        }
    }

    /** Persist last successful intent + slots for structured follow-ups. */
    public void saveLastSlots(String threadId, String intent, Map<String, String> slots) {
        if (threadId == null || threadId.isBlank()) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("intent", intent == null ? "" : intent);
            payload.put("slots", slots == null ? Map.of() : slots);
            redis.opsForValue().set(
                    slotsKey(threadId),
                    objectMapper.writeValueAsString(payload),
                    Duration.ofMinutes(properties.conversationMemoryTtlMinutes()));
        } catch (Exception e) {
            log.warn("AI last-slots write failed type={}", e.getClass().getSimpleName());
        }
    }

    public LastSlots loadLastSlots(String threadId) {
        if (threadId == null || threadId.isBlank()) {
            return null;
        }
        try {
            String raw = redis.opsForValue().get(slotsKey(threadId));
            if (raw == null || raw.isBlank()) {
                return null;
            }
            Map<String, Object> payload = objectMapper.readValue(raw, new TypeReference<>() {});
            if (payload == null) {
                return null;
            }
            Object intentObj = payload.get("intent");
            String intent = intentObj == null ? "" : intentObj.toString();
            Map<String, String> slots = new LinkedHashMap<>();
            Object slotsObj = payload.get("slots");
            if (slotsObj instanceof Map<?, ?> m) {
                m.forEach((k, v) -> {
                    if (k != null && v != null) {
                        slots.put(k.toString(), v.toString());
                    }
                });
            }
            return new LastSlots(intent, slots);
        } catch (Exception e) {
            log.warn("AI last-slots read failed type={}", e.getClass().getSimpleName());
            return null;
        }
    }

    /**
     * Rebuild Redis short-term memory from durable MySQL history so a restored
     * thread can continue follow-ups after TTL expiry.
     */
    public void rehydrate(String threadId, List<Turn> turns) {
        if (threadId == null || threadId.isBlank() || turns == null || turns.isEmpty()) {
            return;
        }
        List<Turn> copy = new ArrayList<>(turns);
        int max = properties.conversationMemoryTurns();
        while (copy.size() > max) {
            copy.remove(0);
        }
        try {
            redis.opsForValue().set(
                    key(threadId),
                    objectMapper.writeValueAsString(copy),
                    Duration.ofMinutes(properties.conversationMemoryTtlMinutes()));
            Turn last = copy.get(copy.size() - 1);
            if (last.intent() != null && !last.intent().isBlank()) {
                saveLastSlots(threadId, last.intent(), last.slots());
            }
        } catch (Exception e) {
            log.warn("AI conversation rehydrate failed type={}", e.getClass().getSimpleName());
        }
    }

    private List<Turn> load(String threadId) {
        if (threadId == null || threadId.isBlank()) {
            return new ArrayList<>();
        }
        try {
            String raw = redis.opsForValue().get(key(threadId));
            if (raw == null || raw.isBlank()) {
                return new ArrayList<>();
            }
            List<Turn> turns = objectMapper.readValue(raw, new TypeReference<>() {});
            return turns == null ? new ArrayList<>() : new ArrayList<>(turns);
        } catch (Exception e) {
            log.warn("AI conversation memory read failed type={}", e.getClass().getSimpleName());
            return new ArrayList<>();
        }
    }

    private static String key(String threadId) {
        return KEY_PREFIX + threadId;
    }

    private static String slotsKey(String threadId) {
        return SLOTS_PREFIX + threadId;
    }

    private static String trim(String text, int max) {
        if (text.length() <= max) {
            return text;
        }
        return text.substring(0, max) + "…";
    }

    public record Turn(String question, String intent, String answer, Map<String, String> slots) {
        public Turn(String question, String intent, String answer) {
            this(question, intent, answer, Map.of());
        }

        public Turn {
            slots = slots == null ? Map.of() : Map.copyOf(slots);
        }
    }

    public record LastSlots(String intent, Map<String, String> slots) {}
}
