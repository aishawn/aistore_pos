package com.orithos.modules.integration;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface IntegrationMapper {

    @Select("SELECT * FROM integration ORDER BY created_at DESC, id DESC")
    List<Integration> findAll();

    @Select("SELECT * FROM integration WHERE id = #{id}")
    Integration findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO integration (name, type, enabled, config) "
            + "VALUES (#{name}, #{type}, #{enabled}, #{config})")
    int insert(Integration i);

    @Update("UPDATE integration SET name=#{name}, type=#{type}, enabled=#{enabled}, config=#{config} WHERE id=#{id}")
    int update(Integration i);

    @Delete("DELETE FROM integration WHERE id = #{id}")
    int delete(Long id);
}
