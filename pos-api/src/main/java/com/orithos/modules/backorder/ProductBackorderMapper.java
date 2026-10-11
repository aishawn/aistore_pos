package com.orithos.modules.backorder;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ProductBackorderMapper {

    @Select("SELECT * FROM product_backorder WHERE (#{productId} IS NULL OR product_id = #{productId}) ORDER BY created_at DESC")
    List<ProductBackorder> findAll(@Param("productId") Long productId);

    @Select("SELECT * FROM product_backorder WHERE id = #{id}")
    ProductBackorder findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO product_backorder (product_id, customer_id, outlet_id, on_order_id, quantity, recurring_period, next_due_date, notes) "
            + "VALUES (#{productId}, #{customerId}, #{outletId}, #{onOrderId}, #{quantity}, #{recurringPeriod}, #{nextDueDate}, #{notes})")
    int insert(ProductBackorder b);

    @Update("UPDATE product_backorder SET product_id=#{productId}, customer_id=#{customerId}, outlet_id=#{outletId}, "
            + "on_order_id=#{onOrderId}, quantity=#{quantity}, recurring_period=#{recurringPeriod}, "
            + "next_due_date=#{nextDueDate}, notes=#{notes} WHERE id=#{id}")
    int update(ProductBackorder b);

    @Delete("DELETE FROM product_backorder WHERE id = #{id}")
    int delete(Long id);
}
