package com.orithos.modules.promotion;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PromotionCategoryMapper {

    @Select("SELECT * FROM promotion_category WHERE deleted_at IS NULL ORDER BY id DESC")
    List<PromotionCategory> findAll();

    @Select("SELECT * FROM promotion_category WHERE id = #{id}")
    PromotionCategory findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO promotion_category (name, mdb_id, show_on_order, include_in_integrations) "
            + "VALUES (#{name}, #{mdbId}, #{showOnOrder}, #{includeInIntegrations})")
    int insert(PromotionCategory c);

    @Update("UPDATE promotion_category SET name=#{name}, show_on_order=#{showOnOrder}, "
            + "include_in_integrations=#{includeInIntegrations} WHERE id=#{id}")
    int update(PromotionCategory c);

    @Update("UPDATE promotion_category SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);
}
