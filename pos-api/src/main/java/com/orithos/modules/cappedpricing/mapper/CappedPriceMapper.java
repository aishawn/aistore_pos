package com.orithos.modules.cappedpricing.mapper;

import com.orithos.modules.cappedpricing.CappedPriceQuery;
import com.orithos.modules.cappedpricing.CappedPriceRow;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface CappedPriceMapper {
    List<CappedPriceRow> list(@Param("q") CappedPriceQuery q);

    long count(@Param("q") CappedPriceQuery q);

    @Update("UPDATE product_price SET price = #{price} WHERE id = #{priceId}")
    int updateCurrentPrice(@Param("priceId") Long priceId, @Param("price") BigDecimal price);

    @Select("""
            SELECT p.id
            FROM product p
            LEFT JOIN product_barcode pb ON pb.product_id = p.id
            WHERE p.deleted_at IS NULL
              AND (p.name = #{key} OR pb.code = #{key} OR p.metcash_msc = #{key})
            LIMIT 1
            """)
    Long findProductId(@Param("key") String key);

    @Insert("""
            INSERT INTO capped_price (product_id, source, source_type, price_set_name, start_date, end_date, quantity, capped_price)
            VALUES (#{productId}, #{source}, #{sourceType}, #{priceSetName}, #{startDate}, #{endDate}, #{quantity}, #{cappedPrice})
            """)
    int insertImported(@Param("productId") Long productId,
                       @Param("source") String source,
                       @Param("sourceType") String sourceType,
                       @Param("priceSetName") String priceSetName,
                       @Param("startDate") LocalDate startDate,
                       @Param("endDate") LocalDate endDate,
                       @Param("quantity") BigDecimal quantity,
                       @Param("cappedPrice") BigDecimal cappedPrice);
}
