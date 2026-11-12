package com.orithos.modules.tax;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface TaxRateMapper {

    @Select("""
            SELECT tr.*, (
              SELECT COUNT(*) FROM product p
              WHERE p.outlet_id = #{outletId} AND p.deleted_at IS NULL
                AND (p.tax_rate_id = tr.id OR p.cost_tax_rate_id = tr.id)
            ) AS product_count
            FROM tax_rate tr
            WHERE tr.outlet_id = #{outletId} AND (tr.deleted_at IS NULL
               OR EXISTS (
                 SELECT 1 FROM product p
                 WHERE p.outlet_id = #{outletId} AND p.deleted_at IS NULL
                   AND (p.tax_rate_id = tr.id OR p.cost_tax_rate_id = tr.id)
               ))
            ORDER BY tr.id DESC
            """)
    List<TaxRate> findAll(@Param("outletId") Long outletId);

    @Select("SELECT * FROM tax_rate WHERE id = #{id} AND outlet_id = #{outletId}")
    TaxRate findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT * FROM tax_rate WHERE outlet_id = #{outletId} AND deleted_at IS NULL ORDER BY id ASC")
    List<TaxRate> findAllActiveAsc(@Param("outletId") Long outletId);

    @Select("SELECT * FROM tax_rate WHERE outlet_id = #{outletId} AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})) AND deleted_at IS NULL ORDER BY id LIMIT 1")
    TaxRate findByNameIgnoreCase(@Param("name") String name, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO tax_rate (name, amount, mdb_id, is_default, outlet_id) "
            + "VALUES (#{name}, #{amount}, #{mdbId}, CASE WHEN #{isDefault} THEN 1 ELSE 0 END, #{outletId})")
    int insert(TaxRate t);

    @Update("UPDATE tax_rate SET name=#{rate.name}, amount=#{rate.amount}, is_default=#{rate.isDefault} WHERE id=#{rate.id} AND outlet_id=#{outletId}")
    int update(@Param("rate") TaxRate rate, @Param("outletId") Long outletId);

    @Update("UPDATE tax_rate SET deleted_at = NOW() WHERE id=#{id} AND outlet_id=#{outletId}")
    int softDelete(@Param("id") Long id, @Param("outletId") Long outletId);

    @Update("UPDATE tax_rate SET is_default = 0 WHERE outlet_id=#{outletId} AND deleted_at IS NULL")
    int clearDefaults(@Param("outletId") Long outletId);

    @Update("UPDATE tax_rate SET is_default = 1 WHERE id=#{id} AND outlet_id=#{outletId} AND deleted_at IS NULL")
    int markDefault(@Param("id") Long id, @Param("outletId") Long outletId);

    // ---- merge: reassign every reference from a source rate to the target ----
    @Update("UPDATE product SET tax_rate_id=#{target} WHERE outlet_id=#{outletId} AND tax_rate_id=#{source}")
    int reassignProductTaxRate(@Param("target") Long target, @Param("source") Long source, @Param("outletId") Long outletId);

    @Update("UPDATE product SET cost_tax_rate_id=#{target} WHERE outlet_id=#{outletId} AND cost_tax_rate_id=#{source}")
    int reassignProductCostTaxRate(@Param("target") Long target, @Param("source") Long source, @Param("outletId") Long outletId);

    @Update("UPDATE vendor SET default_tax_rate_id=#{target} WHERE id=#{vendorId} AND default_tax_rate_id=#{source}")
    int reassignVendorDefaultTaxRate(@Param("target") Long target, @Param("source") Long source, @Param("vendorId") Long vendorId);

    @Update("UPDATE sale_item SET tax_rate_id=#{target} WHERE outlet_id=#{outletId} AND tax_rate_id=#{source}")
    int reassignSaleItemTaxRate(@Param("target") Long target, @Param("source") Long source, @Param("outletId") Long outletId);
}
