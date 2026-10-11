package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SecurityEventMapper {

    @Select("SELECT * FROM security_event WHERE 1=1 "
            + "AND (#{event} IS NULL OR event = #{event}) "
            + "ORDER BY timestamp DESC LIMIT #{size} OFFSET #{offset}")
    List<SecurityEvent> page(@Param("event") String event,
                             @Param("size") int size,
                             @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM security_event WHERE 1=1 "
            + "AND (#{event} IS NULL OR event = #{event})")
    long count(@Param("event") String event);

    @Select("SELECT * FROM security_event WHERE id = #{id}")
    SecurityEvent findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO security_event (outlet_id, register_id, user_id, device_id, event, "
            + "meta_data, ipv4, ipv6, user_agent, timestamp) "
            + "VALUES (#{outletId}, #{registerId}, #{userId}, #{deviceId}, #{event}, "
            + "#{metaData}, #{ipv4}, #{ipv6}, #{userAgent}, #{timestamp})")
    int insert(SecurityEvent e);
}
