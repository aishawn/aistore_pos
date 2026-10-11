package com.orithos.modules.stocktake;

import org.apache.ibatis.annotations.*;
import com.orithos.modules.product.Product;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface StocktakeMapper {

    @Select("SELECT * FROM stocktake WHERE "
            + "(#{status} IS NULL OR status=#{status}) "
            + "AND (#{outletId} IS NULL OR outlet_id=#{outletId}) "
            + "AND (#{createdFromAt} IS NULL OR created_at >= #{createdFromAt}) "
            + "AND (#{createdToAt} IS NULL OR created_at < #{createdToAt}) "
            + "AND (#{completedFromAt} IS NULL OR (completed_at IS NOT NULL AND completed_at >= #{completedFromAt})) "
            + "AND (#{completedToAt} IS NULL OR (completed_at IS NOT NULL AND completed_at < #{completedToAt})) "
            + "ORDER BY created_at DESC LIMIT #{size} OFFSET #{offset}")
    List<Stocktake> page(@Param("status") String status,
                         @Param("outletId") Long outletId,
                         @Param("createdFromAt") LocalDateTime createdFromAt,
                         @Param("createdToAt") LocalDateTime createdToAt,
                         @Param("completedFromAt") LocalDateTime completedFromAt,
                         @Param("completedToAt") LocalDateTime completedToAt,
                         @Param("size") int size,
                         @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM stocktake WHERE "
            + "(#{status} IS NULL OR status=#{status}) "
            + "AND (#{outletId} IS NULL OR outlet_id=#{outletId}) "
            + "AND (#{createdFromAt} IS NULL OR created_at >= #{createdFromAt}) "
            + "AND (#{createdToAt} IS NULL OR created_at < #{createdToAt}) "
            + "AND (#{completedFromAt} IS NULL OR (completed_at IS NOT NULL AND completed_at >= #{completedFromAt})) "
            + "AND (#{completedToAt} IS NULL OR (completed_at IS NOT NULL AND completed_at < #{completedToAt}))")
    long count(@Param("status") String status,
               @Param("outletId") Long outletId,
               @Param("createdFromAt") LocalDateTime createdFromAt,
               @Param("createdToAt") LocalDateTime createdToAt,
               @Param("completedFromAt") LocalDateTime completedFromAt,
               @Param("completedToAt") LocalDateTime completedToAt);

    @Select("SELECT * FROM stocktake WHERE id = #{id}")
    Stocktake findById(Long id);

    @Select("SELECT * FROM stocktake WHERE outlet_id=#{outletId} AND type='EXPRESS' AND status='IN_PROGRESS' "
            + "ORDER BY created_at DESC LIMIT 1")
    Stocktake findInProgressExpress(@Param("outletId") Long outletId);

    List<StocktakeProductLine> findProductLines(@Param("stocktakeId") Long stocktakeId);

    List<StocktakeProductSearchHit> searchProducts(@Param("query") String query, @Param("limit") int limit);

    Product findProductByBarcode(@Param("code") String code);

    BigDecimal findInventoryQuantity(@Param("productId") Long productId, @Param("outletId") Long outletId);

    int incrementActualCount(@Param("stocktakeId") Long stocktakeId,
                             @Param("productId") Long productId,
                             @Param("increment") BigDecimal increment);

    @Select("SELECT * FROM stocktake_product WHERE stocktake_id=#{stocktakeId} AND product_id=#{productId} LIMIT 1")
    StocktakeProduct findProductLine(@Param("stocktakeId") Long stocktakeId, @Param("productId") Long productId);

    @Select("SELECT * FROM stocktake_product WHERE stocktake_id = #{stocktakeId} ORDER BY id")
    List<StocktakeProduct> findProducts(Long stocktakeId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO stocktake (name, type, outlet_id, status, display_expected, applied, completed_by_id) "
            + "VALUES (#{name}, #{type}, #{outletId}, #{status}, #{displayExpected}, #{applied}, #{completedById})")
    int insert(Stocktake s);

    @Update("UPDATE stocktake SET name=#{name}, status=#{status}, display_expected=#{displayExpected} WHERE id=#{id}")
    int update(Stocktake s);

    @Update("UPDATE stocktake SET status='COMPLETED', completed_at=NOW() WHERE id=#{id}")
    int complete(Long id);

    @Update("UPDATE stocktake SET status='CANCELLED' WHERE id=#{id}")
    int cancel(Long id);

    @Update("UPDATE stocktake SET applied=1 WHERE id=#{id}")
    int apply(Long id);

    @Delete("DELETE FROM stocktake_product WHERE stocktake_id=#{stocktakeId} AND product_id=#{productId}")
    int deleteProduct(@Param("stocktakeId") Long stocktakeId, @Param("productId") Long productId);

    @Insert("INSERT INTO stocktake_product (stocktake_id, product_id, cost, case_quantity, scanned, "
            + "expected_count, expected_value, actual_count, actual_value) "
            + "VALUES (#{stocktakeId}, #{productId}, #{cost}, #{caseQuantity}, #{scanned}, "
            + "#{expectedCount}, #{expectedValue}, #{actualCount}, #{actualValue})")
    int insertProduct(StocktakeProduct p);

    @Update("UPDATE stocktake_product SET actual_count=#{counted} "
            + "WHERE stocktake_id=#{stocktakeId} AND product_id=#{productId}")
    int updateCount(@Param("stocktakeId") Long stocktakeId, @Param("productId") Long productId,
                    @Param("counted") java.math.BigDecimal counted);
}
