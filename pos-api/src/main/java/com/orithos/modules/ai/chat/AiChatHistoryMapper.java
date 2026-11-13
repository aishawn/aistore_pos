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
            SELECT id AS thread_id, vendor_id AS thread_vendor_id, user_id AS thread_user_id,
                   session_key AS thread_session_key, title AS thread_title,
                   created_at AS thread_created_at, updated_at AS thread_updated_at
            FROM ai_chat_thread
            WHERE vendor_id = #{vendorId} AND user_id = #{userId}
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT #{limit}
            """)
    @Results(id = "aiChatThreadMapping", value = {
            @Result(property = "id", column = "thread_id", javaType = Long.class),
            @Result(property = "vendorId", column = "thread_vendor_id", javaType = Long.class),
            @Result(property = "userId", column = "thread_user_id", javaType = Long.class),
            @Result(property = "sessionKey", column = "thread_session_key"),
            @Result(property = "title", column = "thread_title"),
            @Result(property = "createdAt", column = "thread_created_at"),
            @Result(property = "updatedAt", column = "thread_updated_at")
    })
    List<AiChatThread> listThreads(@Param("vendorId") long vendorId,
                                   @Param("userId") long userId,
                                   @Param("limit") int limit);

    @Select("""
            SELECT id AS thread_id, vendor_id AS thread_vendor_id, user_id AS thread_user_id,
                   session_key AS thread_session_key, title AS thread_title,
                   created_at AS thread_created_at, updated_at AS thread_updated_at
            FROM ai_chat_thread
            WHERE id = #{id} AND vendor_id = #{vendorId} AND user_id = #{userId}
            LIMIT 1
            """)
    @Results(id = "aiChatThreadOwnedMapping", value = {
            @Result(property = "id", column = "thread_id", javaType = Long.class),
            @Result(property = "vendorId", column = "thread_vendor_id", javaType = Long.class),
            @Result(property = "userId", column = "thread_user_id", javaType = Long.class),
            @Result(property = "sessionKey", column = "thread_session_key"),
            @Result(property = "title", column = "thread_title"),
            @Result(property = "createdAt", column = "thread_created_at"),
            @Result(property = "updatedAt", column = "thread_updated_at")
    })
    AiChatThread findOwned(@Param("id") long id,
                           @Param("vendorId") long vendorId,
                           @Param("userId") long userId);

    @Select("""
            SELECT id AS thread_id, vendor_id AS thread_vendor_id, user_id AS thread_user_id,
                   session_key AS thread_session_key, title AS thread_title,
                   created_at AS thread_created_at, updated_at AS thread_updated_at
            FROM ai_chat_thread
            WHERE session_key = #{sessionKey}
            LIMIT 1
            """)
    @Results(id = "aiChatThreadSessionMapping", value = {
            @Result(property = "id", column = "thread_id", javaType = Long.class),
            @Result(property = "vendorId", column = "thread_vendor_id", javaType = Long.class),
            @Result(property = "userId", column = "thread_user_id", javaType = Long.class),
            @Result(property = "sessionKey", column = "thread_session_key"),
            @Result(property = "title", column = "thread_title"),
            @Result(property = "createdAt", column = "thread_created_at"),
            @Result(property = "updatedAt", column = "thread_updated_at")
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
            INSERT INTO ai_chat_message (thread_id, role, text_content, intent, report_id, slots_json,
                source, data_as_of, data_source, store_scope, report_period_from, report_period_to,
                report_time_zone, report_data_status)
            VALUES (#{threadId}, #{role}, #{textContent}, #{intent}, #{reportId}, #{slotsJson},
                #{source}, #{dataAsOf}, #{dataSource}, #{storeScope}, #{reportPeriodFrom}, #{reportPeriodTo},
                #{reportTimeZone}, #{reportDataStatus})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertMessage(AiChatMessage message);

    @Select("""
            SELECT id, thread_id AS threadId, role, text_content AS textContent,
                   intent, report_id AS reportId, slots_json AS slotsJson,
                   source, data_as_of AS dataAsOf, data_source AS dataSource, store_scope AS storeScope,
                   report_period_from AS reportPeriodFrom, report_period_to AS reportPeriodTo,
                   report_time_zone AS reportTimeZone, report_data_status AS reportDataStatus,
                   created_at AS createdAt
            FROM ai_chat_message
            WHERE thread_id = #{threadId}
            ORDER BY id ASC
            LIMIT #{limit}
            """)
    List<AiChatMessage> listMessages(@Param("threadId") long threadId, @Param("limit") int limit);

    @Select("""
            SELECT m.id, m.thread_id AS threadId, m.role, m.text_content AS textContent,
                   m.intent, m.report_id AS reportId, m.slots_json AS slotsJson,
                   m.source, m.data_as_of AS dataAsOf, m.data_source AS dataSource, m.store_scope AS storeScope,
                   m.report_period_from AS reportPeriodFrom, m.report_period_to AS reportPeriodTo,
                   m.report_time_zone AS reportTimeZone, m.report_data_status AS reportDataStatus,
                   m.created_at AS createdAt
            FROM ai_chat_message m
            JOIN ai_chat_thread t ON t.id = m.thread_id
            WHERE t.session_key = #{sessionKey}
            ORDER BY m.id ASC
            LIMIT #{limit}
            """)
    List<AiChatMessage> listMessagesBySessionKey(@Param("sessionKey") String sessionKey,
                                                 @Param("limit") int limit);
}
