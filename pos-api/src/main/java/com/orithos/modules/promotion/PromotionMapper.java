package com.orithos.modules.promotion;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PromotionMapper {

    @Select("SELECT * FROM promotion WHERE deleted_at IS NULL "
            + "AND (#{name} IS NULL OR name LIKE CONCAT('%', #{name}, '%')) "
            + "AND (#{promotionCategoryId} IS NULL OR promotion_category_id = #{promotionCategoryId}) "
            + "AND (#{active} IS NULL OR active = #{active}) "
            + "ORDER BY id DESC LIMIT #{size} OFFSET #{offset}")
    List<Promotion> page(@Param("name") String name,
                         @Param("promotionCategoryId") Long promotionCategoryId,
                         @Param("active") Boolean active,
                         @Param("size") int size,
                         @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM promotion WHERE deleted_at IS NULL "
            + "AND (#{name} IS NULL OR name LIKE CONCAT('%', #{name}, '%')) "
            + "AND (#{promotionCategoryId} IS NULL OR promotion_category_id = #{promotionCategoryId}) "
            + "AND (#{active} IS NULL OR active = #{active})")
    long count(@Param("name") String name,
               @Param("promotionCategoryId") Long promotionCategoryId,
               @Param("active") Boolean active);

    @Select("SELECT * FROM promotion WHERE id = #{id}")
    Promotion findById(Long id);

    @Select("SELECT * FROM promotion_criteria WHERE promotion_id = #{promotionId} ORDER BY id")
    List<PromotionCriteria> findCriteriaByPromotionId(Long promotionId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO promotion (name, mdb_id, client_id, promotion_category_id, start, end, "
            + "express, mix_criteria, active, sale_max_application_count) "
            + "VALUES (#{name}, #{mdbId}, #{clientId}, #{promotionCategoryId}, #{start}, #{end}, "
            + "#{express}, #{mixCriteria}, #{active}, #{saleMaxApplicationCount})")
    int insert(Promotion p);

    @Update("UPDATE promotion SET name=#{name}, client_id=#{clientId}, "
            + "promotion_category_id=#{promotionCategoryId}, start=#{start}, end=#{end}, "
            + "express=#{express}, mix_criteria=#{mixCriteria}, active=#{active}, "
            + "sale_max_application_count=#{saleMaxApplicationCount} WHERE id=#{id}")
    int update(Promotion p);

    @Update("UPDATE promotion SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Update("UPDATE promotion SET active = #{active} WHERE id=#{id}")
    int setActive(@Param("id") Long id, @Param("active") boolean active);

    @Insert("INSERT INTO promotion_criteria (promotion_id, type, buy_amount, buy_amount_max, "
            + "buy_amount_type, discount_amount, min_quantity, quantity_type, mixed_only, optional) "
            + "VALUES (#{promotionId}, #{type}, #{buyAmount}, #{buyAmountMax}, "
            + "#{buyAmountType}, #{discountAmount}, #{minQuantity}, #{quantityType}, #{mixedOnly}, #{optional})")
    int insertCriteria(PromotionCriteria c);
}
