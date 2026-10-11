package com.orithos.modules.report;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ReportMapper {

    @Select("SELECT * FROM report ORDER BY created_at DESC")
    List<Report> findAll();

    @Select("SELECT * FROM report WHERE id = #{id}")
    Report findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO report (name, type, query, special, email_settings, filter, owner_id) "
            + "VALUES (#{name}, #{type}, #{query}, #{special}, #{emailSettings}, #{filter}, #{ownerId})")
    int insert(Report r);

    @Update("UPDATE report SET name=#{name}, type=#{type}, query=#{query}, special=#{special}, "
            + "email_settings=#{emailSettings}, filter=#{filter} WHERE id=#{id}")
    int update(Report r);

    @Update("UPDATE report SET email_settings=#{emailSettings} WHERE id=#{id}")
    int updateEmailSettings(@Param("id") Long id, @Param("emailSettings") String emailSettings);

    @Delete("DELETE FROM report WHERE id=#{id}")
    int delete(Long id);
}
