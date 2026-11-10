package com.orithos.modules.tax;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface TaxRateMapper {

    @Select("""
            SELECT tr.*, (
              SELECT COUNT(*) FROM product p
              WHERE p.deleted_at IS NULL
                AND (p.tax_rate_id = tr.id OR p.cost_tax_rate_id = tr.id)
            ) AS product_count
            FROM tax_rate tr
            WHERE tr.deleted_at IS NULL
               OR EXISTS (
                 SELECT 1 FROM product p
                 WHERE p.deleted_at IS NULL
                   AND (p.tax_rate_id = tr.id OR p.cost_tax_rate_id = tr.id)
               )
            ORDER BY tr.id DESC
            """)
    List<TaxRate> findAll();

    @Select("SELECT * FROM tax_rate WHERE id = #{id}")
    TaxRate findById(Long id);

    @Select("SELECT * FROM tax_rate WHERE deleted_at IS NULL ORDER BY id ASC")
    List<TaxRate> findAllActiveAsc();

    @Select("SELECT * FROM tax_rate WHERE LOWER(TRIM(name)) = LOWER(TRIM(#{name})) AND deleted_at IS NULL ORDER BY id LIMIT 1")
    TaxRate findByNameIgnoreCase(String name);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO tax_rate (name, amount, mdb_id, is_default, outlet_id) "
            + "VALUES (#{name}, #{amount}, #{mdbId}, CASE WHEN #{isDefault} THEN 1 ELSE 0 END, #{outletId})")
    int insert(TaxRate t);

    @Update("UPDATE tax_rate SET name=#{name}, amount=#{amount}, is_default=#{isDefault} WHERE id=#{id}")
    int update(TaxRate t);

    @Update("UPDATE tax_rate SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Update("UPDATE tax_rate SET is_default = 0 WHERE deleted_at IS NULL")
    int clearDefaults();

    @Update("UPDATE tax_rate SET is_default = 1 WHERE id=#{id}")
    int markDefault(Long id);

    // ---- merge: reassign every reference from a source rate to the target ----
    @Update("UPDATE product SET tax_rate_id=#{target} WHERE tax_rate_id=#{source}")
    int reassignProductTaxRate(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE product SET cost_tax_rate_id=#{target} WHERE cost_tax_rate_id=#{source}")
    int reassignProductCostTaxRate(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE vendor SET default_tax_rate_id=#{target} WHERE default_tax_rate_id=#{source}")
    int reassignVendorDefaultTaxRate(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE sale_item SET tax_rate_id=#{target} WHERE tax_rate_id=#{source}")
    int reassignSaleItemTaxRate(@Param("target") Long target, @Param("source") Long source);
}
