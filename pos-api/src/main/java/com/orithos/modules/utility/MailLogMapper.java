package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface MailLogMapper {

    @Select("SELECT * FROM mail_log WHERE 1=1 "
            + "AND (#{recipient} IS NULL OR recipient = #{recipient}) "
            + "ORDER BY sent_at DESC LIMIT #{size} OFFSET #{offset}")
    List<MailLog> page(@Param("recipient") String recipient,
                       @Param("size") int size,
                       @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM mail_log WHERE 1=1 "
            + "AND (#{recipient} IS NULL OR recipient = #{recipient})")
    long count(@Param("recipient") String recipient);

    @Select("SELECT * FROM mail_log WHERE id = #{id}")
    MailLog findById(Long id);
}
