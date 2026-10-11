package com.orithos.modules.order;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface OrderReviewMapper {

    @Select("SELECT * FROM order_review WHERE (#{orderId} IS NULL OR order_id = #{orderId}) ORDER BY created_at DESC")
    List<OrderReview> findAll(@Param("orderId") Long orderId);

    @Select("SELECT * FROM order_review WHERE id = #{id}")
    OrderReview findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO order_review (order_id, status, notes, data) "
            + "VALUES (#{orderId}, #{status}, #{notes}, #{data})")
    int insert(OrderReview r);

    @Update("UPDATE order_review SET status=#{status}, notes=#{notes}, data=#{data} WHERE id=#{id}")
    int update(OrderReview r);

    @Delete("DELETE FROM order_review WHERE id = #{id}")
    int delete(Long id);
}
