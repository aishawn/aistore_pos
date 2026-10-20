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
import java.util.List;

/**
 * Redis-backed recent turns for a vendor:user:session thread. Used to resolve
 * follow-ups like "and yesterday?" without inventing numbers from prior answers.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class AiConversationMemory {

    private static final Logger log = LoggerFactory.getLogger(AiConversationMemory.class);
    private static final String KEY_PREFIX = "ai:chat:";

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
        if (threadId == null || threadId.isBlank() || question == null || question.isBlank()) {
            return;
        }
        List<Turn> turns = load(threadId);
        turns.add(new Turn(question.trim(), intent == null ? "" : intent, answer == null ? "" : answer.trim()));
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
        } catch (Exception e) {
            log.warn("AI conversation memory clear failed type={}", e.getClass().getSimpleName());
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

    private static String trim(String text, int max) {
        if (text.length() <= max) {
            return text;
        }
        return text.substring(0, max) + "…";
    }

    public record Turn(String question, String intent, String answer) {}
}
