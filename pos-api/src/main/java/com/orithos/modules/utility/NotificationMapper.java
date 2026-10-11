package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface NotificationMapper {

    @Select("SELECT * FROM notification ORDER BY created_at DESC LIMIT #{size} OFFSET #{offset}")
    List<Notification> page(@Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM notification")
    long count();

    @Update("UPDATE notification SET read_at = NOW() WHERE id = #{id}")
    int markRead(Long id);

    @Update("UPDATE notification SET read_at = NOW() WHERE read_at IS NULL")
    int markAllRead();

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO notification (notifiable_type, notifiable_id, data) "
            + "VALUES (#{notifiableType}, #{notifiableId}, #{data})")
    int insert(Notification n);

    @Delete("DELETE FROM notification WHERE id = #{id}")
    int delete(Long id);

    @Delete("DELETE FROM notification")
    int deleteAll();
}
