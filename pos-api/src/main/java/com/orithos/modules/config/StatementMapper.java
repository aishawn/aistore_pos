package com.orithos.modules.config;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface StatementMapper {

    @Select("SELECT * FROM statement ORDER BY id DESC")
    List<Statement> findAll();

    @Select("SELECT * FROM statement WHERE id = #{id}")
    Statement findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO statement (name, components, signature, reply_to, subject) "
            + "VALUES (#{name}, #{components}, #{signature}, #{replyTo}, #{subject})")
    int insert(Statement s);

    @Update("UPDATE statement SET name=#{name}, components=#{components}, signature=#{signature}, "
            + "reply_to=#{replyTo}, subject=#{subject} WHERE id=#{id}")
    int update(Statement s);

    @Delete("DELETE FROM statement WHERE id=#{id}")
    int delete(Long id);
}
