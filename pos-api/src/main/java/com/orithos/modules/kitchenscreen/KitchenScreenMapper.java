package com.orithos.modules.kitchenscreen;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface KitchenScreenMapper {

    @Select("SELECT * FROM kitchen_screen ORDER BY created_at DESC, id DESC")
    List<KitchenScreen> findAll();

    @Select("SELECT * FROM kitchen_screen WHERE id = #{id}")
    KitchenScreen findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO kitchen_screen (name, rules) VALUES (#{name}, #{rules})")
    int insert(KitchenScreen k);

    @Update("UPDATE kitchen_screen SET name=#{name}, rules=#{rules} WHERE id=#{id}")
    int update(KitchenScreen k);

    @Delete("DELETE FROM kitchen_screen WHERE id = #{id}")
    int delete(Long id);
}
