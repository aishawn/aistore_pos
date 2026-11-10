package com.orithos.modules.pricing;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PriceListMapper {

    @Select("SELECT * FROM price_list WHERE outlet_id = #{outletId} AND active = TRUE ORDER BY created_at DESC, id DESC")
    List<PriceList> findAll(@Param("outletId") Long outletId);

    @Select("SELECT * FROM price_list "
            + "WHERE outlet_id = #{outletId} AND active = TRUE "
            + "AND (CAST(#{name} AS VARCHAR) IS NULL OR name LIKE CONCAT('%', CAST(#{name} AS VARCHAR), '%') ESCAPE '!') "
            + "ORDER BY created_at DESC, id DESC LIMIT #{size} OFFSET #{offset}")
    List<PriceList> page(@Param("name") String name, @Param("outletId") Long outletId, @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM price_list "
            + "WHERE outlet_id = #{outletId} AND active = TRUE "
            + "AND (CAST(#{name} AS VARCHAR) IS NULL OR name LIKE CONCAT('%', CAST(#{name} AS VARCHAR), '%') ESCAPE '!')")
    long count(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("SELECT * FROM price_list WHERE id = #{id} AND outlet_id = #{outletId} AND active = TRUE")
    PriceList findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO price_list (name, allow_higher_price, allow_discounting_promotions, outlet_id) "
            + "VALUES (#{name}, #{allowHigherPrice}, #{allowDiscountingPromotions}, #{outletId})")
    int insert(PriceList p);

    @Update("UPDATE price_list SET name=#{name}, allow_higher_price=#{allowHigherPrice}, "
            + "allow_discounting_promotions=#{allowDiscountingPromotions} WHERE id=#{id} AND outlet_id=#{outletId} AND active=TRUE")
    int update(PriceList p);

    @Update("UPDATE price_list SET active=FALSE, updated_at=CURRENT_TIMESTAMP WHERE id=#{id} AND outlet_id=#{outletId} AND active=TRUE")
    int archive(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT * FROM price_list_item WHERE price_list_id = #{priceListId} AND outlet_id = #{outletId} ORDER BY id")
    List<PriceListItem> findItems(@Param("priceListId") Long priceListId, @Param("outletId") Long outletId);

    @Insert("INSERT INTO price_list_item (price_list_id, classification_type, item_id, exclude, rule, amount, outlet_id) "
            + "VALUES (#{priceListId}, #{classificationType}, #{itemId}, #{exclude}, #{rule}, #{amount}, #{outletId})")
    int insertItem(PriceListItem item);

    @Delete("DELETE FROM price_list_item WHERE price_list_id = #{priceListId} AND outlet_id = #{outletId}")
    int deleteItems(@Param("priceListId") Long priceListId, @Param("outletId") Long outletId);
}
