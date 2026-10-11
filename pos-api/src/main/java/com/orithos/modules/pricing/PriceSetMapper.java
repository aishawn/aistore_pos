package com.orithos.modules.pricing;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PriceSetMapper {

    @Select("SELECT * FROM price_set ORDER BY id DESC")
    List<PriceSet> findAll();

    @Select("SELECT * FROM price_set WHERE id = #{id}")
    PriceSet findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO price_set (name, parent_id) VALUES (#{name}, #{parentId})")
    int insert(PriceSet p);

    @Update("UPDATE price_set SET name=#{name}, parent_id=#{parentId} WHERE id=#{id}")
    int update(PriceSet p);

    @Delete("DELETE FROM price_set WHERE id=#{id}")
    int delete(Long id);
}
