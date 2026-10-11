package com.orithos.modules.externalstocktake;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface ExternalStocktakeMapper {

    @Select("SELECT e.*, o.name AS outlet_name FROM external_stocktake e "
            + "LEFT JOIN outlet o ON o.id = e.outlet_id "
            + "ORDER BY e.timestamp DESC, e.id DESC")
    List<ExternalStocktake> findAll();

    @Select("SELECT e.*, o.name AS outlet_name FROM external_stocktake e "
            + "LEFT JOIN outlet o ON o.id = e.outlet_id "
            + "ORDER BY e.timestamp DESC, e.id DESC "
            + "LIMIT #{size} OFFSET #{offset}")
    List<ExternalStocktake> page(@Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM external_stocktake")
    long count();

    @Select("SELECT * FROM external_stocktake WHERE id = #{id}")
    ExternalStocktake findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO external_stocktake (outlet_id, user_id, completed_id, zero_stock, override_stock, status, timestamp) "
            + "VALUES (#{outletId}, #{userId}, #{completedId}, #{zeroStock}, #{overrideStock}, #{status}, #{timestamp})")
    int insert(ExternalStocktake e);

    @Update("UPDATE external_stocktake SET outlet_id=#{outletId}, user_id=#{userId}, completed_id=#{completedId}, "
            + "zero_stock=#{zeroStock}, override_stock=#{overrideStock}, status=#{status} WHERE id=#{id}")
    int update(ExternalStocktake e);

    @Update("UPDATE external_stocktake SET status='COMPLETED' WHERE id=#{id}")
    int complete(Long id);

    @Delete("DELETE FROM external_stocktake WHERE id = #{id}")
    int delete(Long id);

    @Select("SELECT o.name AS outlet_name, pb.code AS barcode, p.case_quantity "
            + "FROM product p "
            + "INNER JOIN product_barcode pb ON pb.product_id = p.id "
            + "INNER JOIN outlet o ON o.id = #{outletId} "
            + "WHERE p.deleted_at IS NULL "
            + "ORDER BY p.name, pb.code")
    List<ExternalStocktakeExportRow> exportProductsWithBarcodes(@Param("outletId") Long outletId);

    @Select("SELECT o.name AS outlet_name, p.case_quantity "
            + "FROM product p "
            + "INNER JOIN outlet o ON o.id = #{outletId} "
            + "WHERE p.deleted_at IS NULL "
            + "AND NOT EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.product_id = p.id) "
            + "ORDER BY p.name")
    List<ExternalStocktakeExportRow> exportProductsWithoutBarcodes(@Param("outletId") Long outletId);
}
