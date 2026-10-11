package com.orithos.modules.pricing;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PriceListMapper {

    @Select("SELECT * FROM price_list ORDER BY created_at DESC, id DESC")
    List<PriceList> findAll();

    @Select("SELECT * FROM price_list "
            + "WHERE (#{name} IS NULL OR name LIKE CONCAT('%', #{name}, '%') ESCAPE '!') "
            + "ORDER BY created_at DESC, id DESC LIMIT #{size} OFFSET #{offset}")
    List<PriceList> page(@Param("name") String name, @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM price_list "
            + "WHERE (#{name} IS NULL OR name LIKE CONCAT('%', #{name}, '%'))")
    long count(@Param("name") String name);

    @Select("SELECT * FROM price_list WHERE id = #{id}")
    PriceList findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO price_list (name, allow_higher_price, allow_discounting_promotions) "
            + "VALUES (#{name}, #{allowHigherPrice}, #{allowDiscountingPromotions})")
    int insert(PriceList p);

    @Update("UPDATE price_list SET name=#{name}, allow_higher_price=#{allowHigherPrice}, "
            + "allow_discounting_promotions=#{allowDiscountingPromotions} WHERE id=#{id}")
    int update(PriceList p);

    @Delete("DELETE FROM price_list WHERE id=#{id}")
    int delete(Long id);

    @Select("SELECT * FROM price_list_item WHERE price_list_id = #{priceListId} ORDER BY id")
    List<PriceListItem> findItems(Long priceListId);

    @Insert("INSERT INTO price_list_item (price_list_id, classification_type, item_id, exclude, rule, amount) "
            + "VALUES (#{priceListId}, #{classificationType}, #{itemId}, #{exclude}, #{rule}, #{amount})")
    int insertItem(PriceListItem item);

    @Delete("DELETE FROM price_list_item WHERE price_list_id = #{priceListId}")
    int deleteItems(Long priceListId);
}
