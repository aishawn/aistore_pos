package com.orithos.modules.ai.chat;

import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AiChatHistoryMapperTest {

    @Test
    void ordersThreadsByUpdatedAtAndThenNewestIdForTimestampTies() throws Exception {
        var listThreads = AiChatHistoryMapper.class.getMethod("listThreads", long.class, long.class, int.class);
        String query = String.join(" ", listThreads.getAnnotation(Select.class).value());

        assertTrue(query.contains("ORDER BY updated_at DESC, id DESC"));
    }
}
