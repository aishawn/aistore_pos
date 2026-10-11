package com.orithos.modules.supplier.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SupplierProductImportMapper {

    @Select("SELECT COUNT(*) FROM product_supplier WHERE supplier_id = #{supplierId} AND code = #{code}")
    int countExisting(@Param("supplierId") Long supplierId, @Param("code") String code);

    @Select("""
            SELECT ps.product_id
            FROM product_supplier ps
            INNER JOIN product p ON p.id = ps.product_id AND p.deleted_at IS NULL
            WHERE ps.code = #{code}
            LIMIT 1
            """)
    Long findProductIdByCode(@Param("code") String code);

    @Select("""
            SELECT p.id
            FROM product p
            WHERE p.deleted_at IS NULL
              AND (p.metcash_msc = #{code} OR p.name = #{code})
            LIMIT 1
            """)
    Long findProductIdByMasterReference(@Param("code") String code);

    @Insert("INSERT INTO product_supplier (product_id, supplier_id, code) VALUES (#{productId}, #{supplierId}, #{code})")
    int insertLink(@Param("productId") Long productId,
                   @Param("supplierId") Long supplierId,
                   @Param("code") String code);
}
