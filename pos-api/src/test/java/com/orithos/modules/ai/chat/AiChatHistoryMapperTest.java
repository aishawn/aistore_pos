package com.orithos.modules.ai.chat;

import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AiChatHistoryMapperTest {

    @Test
    void ordersThreadsByUpdatedAtAndThenNewestIdForTimestampTies() throws Exception {
        var listThreads = AiChatHistoryMapper.class.getMethod("listThreads", long.class, long.class, int.class);
        String query = String.join(" ", listThreads.getAnnotation(Select.class).value());

        assertTrue(query.contains("ORDER BY updated_at DESC NULLS LAST, id DESC"));
    }

    @Test
    void sessionKeyHistoryQueriesRequireVendorAndUserOwnership() throws Exception {
        var findOwnedBySessionKey = AiChatHistoryMapper.class.getMethod(
                "findOwnedBySessionKey", String.class, long.class, long.class);
        String threadQuery = String.join(" ", findOwnedBySessionKey.getAnnotation(Select.class).value());
        var listMessagesBySessionKey = AiChatHistoryMapper.class.getMethod(
                "listMessagesBySessionKey", String.class, long.class, long.class, int.class);
        String messageQuery = String.join(" ", listMessagesBySessionKey.getAnnotation(Select.class).value());

        assertTrue(threadQuery.contains("session_key = #{sessionKey}"));
        assertTrue(threadQuery.contains("vendor_id = #{vendorId}"));
        assertTrue(threadQuery.contains("user_id = #{userId}"));
        assertTrue(messageQuery.contains("t.session_key = #{sessionKey}"));
        assertTrue(messageQuery.contains("t.vendor_id = #{vendorId}"));
        assertTrue(messageQuery.contains("t.user_id = #{userId}"));
    }
}
