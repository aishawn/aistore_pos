package com.orithos.modules.ai.chat;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Result;
import org.apache.ibatis.annotations.Results;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface AiChatHistoryMapper {

    @Select("""
            SELECT id, vendor_id AS vendorId, user_id AS userId, session_key AS sessionKey,
                   title, created_at AS createdAt, updated_at AS updatedAt
            FROM ai_chat_thread
            WHERE vendor_id = #{vendorId} AND user_id = #{userId}
            ORDER BY updated_at DESC
            LIMIT #{limit}
            """)
    @Results(id = "aiChatThreadMapping", value = {
            @Result(property = "id", column = "id", javaType = Long.class),
            @Result(property = "vendorId", column = "vendorId", javaType = Long.class),
            @Result(property = "userId", column = "userId", javaType = Long.class),
            @Result(property = "sessionKey", column = "sessionKey"),
            @Result(property = "title", column = "title"),
            @Result(property = "createdAt", column = "createdAt"),
            @Result(property = "updatedAt", column = "updatedAt")
    })
    List<AiChatThread> listThreads(@Param("vendorId") long vendorId,
                                   @Param("userId") long userId,
                                   @Param("limit") int limit);

    @Select("""
            SELECT id, vendor_id AS vendorId, user_id AS userId, session_key AS sessionKey,
                   title, created_at AS createdAt, updated_at AS updatedAt
            FROM ai_chat_thread
            WHERE id = #{id} AND vendor_id = #{vendorId} AND user_id = #{userId}
            LIMIT 1
            """)
    @Results(id = "aiChatThreadOwnedMapping", value = {
            @Result(property = "id", column = "id", javaType = Long.class),
            @Result(property = "vendorId", column = "vendorId", javaType = Long.class),
            @Result(property = "userId", column = "userId", javaType = Long.class),
            @Result(property = "sessionKey", column = "sessionKey"),
            @Result(property = "title", column = "title"),
            @Result(property = "createdAt", column = "createdAt"),
            @Result(property = "updatedAt", column = "updatedAt")
    })
    AiChatThread findOwned(@Param("id") long id,
                           @Param("vendorId") long vendorId,
                           @Param("userId") long userId);

    @Select("""
            SELECT id, vendor_id AS vendorId, user_id AS userId, session_key AS sessionKey,
                   title, created_at AS createdAt, updated_at AS updatedAt
            FROM ai_chat_thread
            WHERE session_key = #{sessionKey}
            LIMIT 1
            """)
    @Results(id = "aiChatThreadSessionMapping", value = {
            @Result(property = "id", column = "id", javaType = Long.class),
            @Result(property = "vendorId", column = "vendorId", javaType = Long.class),
            @Result(property = "userId", column = "userId", javaType = Long.class),
            @Result(property = "sessionKey", column = "sessionKey"),
            @Result(property = "title", column = "title"),
            @Result(property = "createdAt", column = "createdAt"),
            @Result(property = "updatedAt", column = "updatedAt")
    })
    AiChatThread findBySessionKey(@Param("sessionKey") String sessionKey);

    @Insert("""
            INSERT INTO ai_chat_thread (vendor_id, user_id, session_key, title)
            VALUES (#{vendorId}, #{userId}, #{sessionKey}, #{title})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertThread(AiChatThread thread);

    @Update("""
            UPDATE ai_chat_thread
            SET title = COALESCE(#{title}, title), updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id}
            """)
    int touchThread(@Param("id") long id, @Param("title") String title);

    @Insert("""
            INSERT INTO ai_chat_message (thread_id, role, text_content, intent, report_id, slots_json)
            VALUES (#{threadId}, #{role}, #{textContent}, #{intent}, #{reportId}, #{slotsJson})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertMessage(AiChatMessage message);

    @Select("""
            SELECT id, thread_id AS threadId, role, text_content AS textContent,
                   intent, report_id AS reportId, slots_json AS slotsJson, created_at AS createdAt
            FROM ai_chat_message
            WHERE thread_id = #{threadId}
            ORDER BY id ASC
            LIMIT #{limit}
            """)
    List<AiChatMessage> listMessages(@Param("threadId") long threadId, @Param("limit") int limit);
}
