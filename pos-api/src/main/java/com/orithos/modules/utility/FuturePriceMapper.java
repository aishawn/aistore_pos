package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface FuturePriceMapper {

    @Select("SELECT * FROM future_price WHERE 1=1 "
            + "AND (#{productId} IS NULL OR product_id = #{productId}) "
            + "ORDER BY effective_time DESC LIMIT #{size} OFFSET #{offset}")
    List<FuturePrice> page(@Param("productId") Long productId,
                           @Param("size") int size,
                           @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM future_price WHERE 1=1 "
            + "AND (#{productId} IS NULL OR product_id = #{productId})")
    long count(@Param("productId") Long productId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO future_price (product_id, price_set_id, quantity, price, price_ex, user_id, effective_time) "
            + "VALUES (#{productId}, #{priceSetId}, #{quantity}, #{price}, #{priceEx}, #{userId}, #{effectiveTime})")
    int insert(FuturePrice p);

    @Delete("DELETE FROM future_price WHERE id = #{id}")
    int delete(Long id);
}
