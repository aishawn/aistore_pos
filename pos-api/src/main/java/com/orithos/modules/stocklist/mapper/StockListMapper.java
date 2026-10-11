package com.orithos.modules.stocklist.mapper;

import com.orithos.modules.stocklist.StockListQuery;
import com.orithos.modules.stocklist.StockListRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.util.List;

@Mapper
public interface StockListMapper {
    List<StockListRow> page(@Param("q") StockListQuery q);
    long count(@Param("q") StockListQuery q);
    List<StockListRow> export(@Param("q") StockListQuery q);

    @Update("UPDATE product_price SET price = #{price}, quantity = #{quantity} WHERE id = #{priceId}")
    int updatePrice(@Param("priceId") Long priceId,
                    @Param("price") BigDecimal price,
                    @Param("quantity") BigDecimal quantity);
}
