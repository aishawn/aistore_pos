package com.orithos.modules.quickmenu;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface QuickMenuItemMapper {

    @Select("SELECT * FROM quick_menu_item WHERE (#{userId} IS NULL OR user_id = #{userId}) ORDER BY position")
    List<QuickMenuItem> findAll(@Param("userId") Long userId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO quick_menu_item (user_id, name, url, external, position) "
            + "VALUES (#{userId}, #{name}, #{url}, #{external}, #{position})")
    int insert(QuickMenuItem q);

    @Delete("DELETE FROM quick_menu_item WHERE id = #{id}")
    int delete(Long id);
}
