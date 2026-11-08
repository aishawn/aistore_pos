package com.orithos.modules.supplier.mapper;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SupplierProductImportMapper {

    @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(CAST(#{vendorId} AS TEXT) || ':supplier-product:' || CAST(#{supplierId} AS TEXT) || ':' || #{code}, 0))) lock_result")
    Integer lockSupplierProductCode(@Param("vendorId") Long vendorId,
                                    @Param("supplierId") Long supplierId,
                                    @Param("code") String code);

    @Select("""
        SELECT COUNT(*) FROM product_supplier ps
        JOIN outlet o ON o.id=ps.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        WHERE ps.supplier_id=#{supplierId} AND ps.code=#{code}
        """)
    int countExisting(@Param("supplierId") Long supplierId, @Param("code") String code,
                      @Param("vendorId") Long vendorId);

    @Select("""
            SELECT CASE WHEN COUNT(DISTINCT ps.product_id)=1 THEN MIN(ps.product_id) END
            FROM product_supplier ps
            INNER JOIN product p ON p.id=ps.product_id AND p.deleted_at IS NULL
            INNER JOIN outlet po ON po.id=p.outlet_id AND po.vendor_id=#{vendorId} AND po.deleted_at IS NULL
            INNER JOIN outlet lo ON lo.id=ps.outlet_id AND lo.vendor_id=#{vendorId} AND lo.deleted_at IS NULL
            WHERE ps.code=#{code}
            """)
    Long findProductIdByCode(@Param("code") String code, @Param("vendorId") Long vendorId);

    @Select("""
            SELECT CASE WHEN COUNT(DISTINCT p.id)=1 THEN MIN(p.id) END
            FROM product p
            JOIN outlet o ON o.id=p.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
            WHERE p.deleted_at IS NULL AND (p.metcash_msc=#{code} OR p.name=#{code})
            """)
    Long findProductIdByMasterReference(@Param("code") String code,
                                        @Param("vendorId") Long vendorId);

    @Insert("""
        INSERT INTO product_supplier (product_id, supplier_id, code, outlet_id)
        SELECT p.id, s.id, #{code}, p.outlet_id
        FROM product p
        JOIN outlet po ON po.id=p.outlet_id AND po.vendor_id=#{vendorId} AND po.deleted_at IS NULL
        JOIN supplier s ON s.id=#{supplierId} AND s.deleted_at IS NULL
        JOIN outlet so ON so.id=s.outlet_id AND so.vendor_id=#{vendorId} AND so.deleted_at IS NULL
        WHERE p.id=#{productId} AND NOT EXISTS (
            SELECT 1 FROM product_supplier ps
            WHERE ps.product_id=p.id AND ps.supplier_id=s.id AND ps.outlet_id=p.outlet_id
        )
        """)
    int insertLink(@Param("productId") Long productId,
                   @Param("supplierId") Long supplierId,
                   @Param("code") String code,
                   @Param("vendorId") Long vendorId);
}
