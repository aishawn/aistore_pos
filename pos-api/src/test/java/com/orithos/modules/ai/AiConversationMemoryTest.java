package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiConversationMemoryTest {

    @Test
    void appendsWithTtlAndKeepsOnlyConfiguredRecentTurns() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("ai:chat:vendor:user:thread")).thenReturn("["
                + "{\"question\":\"first\",\"intent\":\"qa\",\"answer\":\"one\"},"
                + "{\"question\":\"second\",\"intent\":\"qa\",\"answer\":\"two\"}"
                + "]");
        AiConversationMemory memory = new AiConversationMemory(redis, new com.fasterxml.jackson.databind.ObjectMapper(),
                new AiProperties(true, null, null, null, null, 0.1, 1024, 40, 2, 15));

        memory.append("vendor:user:thread", "third", "report_sales", "three");

        var captured = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(values).set(eq("ai:chat:vendor:user:thread"), captured.capture(), eq(Duration.ofMinutes(15)));
        String stored = captured.getValue();
        assertTrue(stored.contains("second"));
        assertTrue(stored.contains("third"));
        assertTrue(!stored.contains("first"));
    }

    @Test
    void malformedRedisPayloadBecomesEmptyHistoryAndClearUsesScopedKey() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("ai:chat:thread")).thenReturn("not-json");
        AiConversationMemory memory = new AiConversationMemory(redis, new com.fasterxml.jackson.databind.ObjectMapper(),
                new AiProperties(true, null, null, null, null, 0.1, 1024, 40, 6, 120));

        assertEquals("", memory.formatHistory("thread"));
        memory.clear("thread");

        verify(redis).delete("ai:chat:thread");
        verify(redis).delete("ai:slots:thread");
    }

    @Test
    void appendPersistsSlotsAndRehydrateRestoresThem() throws Exception {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("ai:chat:thread")).thenReturn("[]");
        AiProperties properties = new AiProperties(true, null, null, null, null,
                0.1, 1024, 40, 6, 120);
        AiConversationMemory memory = new AiConversationMemory(redis,
                new com.fasterxml.jackson.databind.ObjectMapper(), properties);

        memory.append("thread", "How much Shiraz is in stock?", "report_stock",
                "Shiraz 4", Map.of("query", "Shiraz"));

        var captured = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(values).set(eq("ai:chat:thread"), captured.capture(), eq(Duration.ofMinutes(120)));
        assertTrue(captured.getValue().contains("\"query\":\"Shiraz\""));

        memory.rehydrate("thread", java.util.List.of(
                new AiConversationMemory.Turn("How much Shiraz is in stock?", "report_stock", "Shiraz 4",
                        Map.of("query", "Shiraz"))));

        verify(values).set(eq("ai:slots:thread"),
                org.mockito.ArgumentMatchers.contains("Shiraz"), eq(Duration.ofMinutes(120)));
    }

    @Test
    void loadsLastSlotsOnlyFromTheSuppliedTenantUserThreadKey() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("ai:slots:7:11:thread-a"))
                .thenReturn("{\"intent\":\"report_stock\",\"slots\":{\"query\":\"Shiraz\"}}");
        AiConversationMemory memory = new AiConversationMemory(redis, new com.fasterxml.jackson.databind.ObjectMapper(),
                new AiProperties(true, null, null, null, null, 0.1, 1024, 40, 6, 120));

        AiConversationMemory.LastSlots last = memory.loadLastSlots("7:11:thread-a");

        assertEquals("report_stock", last.intent());
        assertEquals("Shiraz", last.slots().get("query"));
        verify(values).get("ai:slots:7:11:thread-a");
    }
}
