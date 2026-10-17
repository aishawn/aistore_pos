package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrashedItemMapper {

    @Select("SELECT * FROM trashed_item WHERE 1=1 "
            + "AND (#{type} IS NULL OR item_type = #{type}) "
            + "AND (#{query} IS NULL OR LOWER(name) LIKE LOWER(CONCAT('%', #{query}, '%'))) "
            + "ORDER BY deleted_at DESC LIMIT #{size} OFFSET #{offset}")
    List<TrashedItem> page(@Param("type") String type,
                           @Param("query") String query,
                           @Param("size") int size,
                           @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM trashed_item WHERE 1=1 "
            + "AND (#{type} IS NULL OR item_type = #{type}) "
            + "AND (#{query} IS NULL OR LOWER(name) LIKE LOWER(CONCAT('%', #{query}, '%')))" )
    long count(@Param("type") String type, @Param("query") String query);
}
