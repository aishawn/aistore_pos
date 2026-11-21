package com.orithos.modules.supplier;

import lombok.Data;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface SupplierMapper {

    @Select("""
        SELECT s.*, ct.phone, ct.email, (
            SELECT COUNT(DISTINCT lp.product_id)
            FROM (
                SELECT ps.product_id FROM product_supplier ps WHERE ps.supplier_id = s.id
                UNION
                SELECT cp.id FROM product cp WHERE cp.core_supplier_id = s.id
                UNION
                SELECT op.product_id FROM order_product op WHERE op.supplier_id = s.id AND op.product_id IS NOT NULL
            ) lp
            INNER JOIN product p ON p.id = lp.product_id AND p.deleted_at IS NULL
        ) AS product_count
        FROM supplier s
        LEFT JOIN contact ct ON ct.id = s.contact_id
        JOIN outlet o ON o.id=s.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        WHERE (s.deleted_at IS NULL OR EXISTS (
            SELECT 1
            FROM (
                SELECT ps.product_id FROM product_supplier ps WHERE ps.supplier_id = s.id
                UNION
                SELECT cp.id FROM product cp WHERE cp.core_supplier_id = s.id
                UNION
                SELECT op.product_id FROM order_product op WHERE op.supplier_id = s.id AND op.product_id IS NOT NULL
            ) lp
            INNER JOIN product p ON p.id = lp.product_id AND p.deleted_at IS NULL
        ))
          AND (CAST(#{name} AS TEXT) IS NULL OR s.name LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(ct.phone, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(ct.email, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(s.business_number, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(s.account_number, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%'))
        ORDER BY s.id DESC
        LIMIT #{size} OFFSET #{offset}
        """)
    List<Supplier> page(@Param("name") String name, @Param("vendorId") Long vendorId,
                        @Param("size") int size, @Param("offset") int offset);

    @Select("""
        SELECT COUNT(*) FROM supplier s
        LEFT JOIN contact ct ON ct.id = s.contact_id
        JOIN outlet o ON o.id=s.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        WHERE (s.deleted_at IS NULL OR EXISTS (
            SELECT 1
            FROM (
                SELECT ps.product_id FROM product_supplier ps WHERE ps.supplier_id = s.id
                UNION
                SELECT cp.id FROM product cp WHERE cp.core_supplier_id = s.id
                UNION
                SELECT op.product_id FROM order_product op WHERE op.supplier_id = s.id AND op.product_id IS NOT NULL
            ) lp
            INNER JOIN product p ON p.id = lp.product_id AND p.deleted_at IS NULL
        ))
          AND (CAST(#{name} AS TEXT) IS NULL OR s.name LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(ct.phone, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(ct.email, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(s.business_number, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%')
               OR COALESCE(s.account_number, '') LIKE CONCAT('%', CAST(#{name} AS TEXT), '%'))
        """)
    long count(@Param("name") String name, @Param("vendorId") Long vendorId);

    /**
     * Units sold per business day per supplier (COMPLETED, non-refund sales), linking products via
     * product_supplier, product.core_supplier_id and order_product.supplier_id. {@code to} is inclusive.
     */
    @Select("""
        <script>
        SELECT l.supplier_id AS supplier_id,
               COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) AS day,
               COALESCE(SUM(si.quantity), 0) AS quantity
        FROM (
            SELECT ps.supplier_id, ps.product_id FROM product_supplier ps
            UNION
            SELECT cp.core_supplier_id, cp.id FROM product cp WHERE cp.core_supplier_id IS NOT NULL
            UNION
            SELECT op.supplier_id, op.product_id FROM order_product op
            WHERE op.supplier_id IS NOT NULL AND op.product_id IS NOT NULL
        ) l
        INNER JOIN product p ON p.id = l.product_id AND p.deleted_at IS NULL
        INNER JOIN outlet po ON po.id = p.outlet_id AND po.vendor_id = #{vendorId} AND po.deleted_at IS NULL
        INNER JOIN sale_item si ON si.product_id = l.product_id
        INNER JOIN sale s ON s.id = si.sale_id
        WHERE s.status = 'COMPLETED'
          AND s.refund_reason IS NULL AND s.linked_sale_id IS NULL AND COALESCE(s.total_price, 0) >= 0
          AND l.supplier_id IN
          <foreach collection="supplierIds" item="id" open="(" separator="," close=")">#{id}</foreach>
          AND COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) &gt;= CAST(#{from} AS date)
          AND COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) &lt;= CAST(#{to} AS date)
        GROUP BY l.supplier_id, COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date))
        </script>
        """)
    List<SupplierDailyQuantity> salesQuantityByDay(@Param("vendorId") Long vendorId,
                                                   @Param("supplierIds") List<Long> supplierIds,
                                                   @Param("from") String from,
                                                   @Param("to") String to);

    @Data
    class SupplierDailyQuantity {
        private Long supplierId;
        private LocalDate day;
        private BigDecimal quantity;
    }

    @Select("SELECT * FROM supplier WHERE id = #{id}")
    Supplier findById(Long id);

    @Select("SELECT s.* FROM supplier s JOIN outlet o ON o.id=s.outlet_id WHERE s.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL AND s.deleted_at IS NULL")
    Supplier findByIdAndVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("""
        SELECT * FROM supplier
        WHERE deleted_at IS NULL
          AND (
            (#{name} IS NOT NULL AND #{name} != '' AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})))
            OR (#{abn} IS NOT NULL AND #{abn} != ''
                    AND REPLACE(COALESCE(business_number, ''), ' ', '') = REPLACE(#{abn}, ' ', ''))
            OR (#{name} IS NOT NULL AND CHAR_LENGTH(TRIM(#{name})) >= 4
                AND LOWER(name) LIKE CONCAT('%', LOWER(TRIM(#{name})), '%'))
          )
            ORDER BY (LOWER(TRIM(name)) = LOWER(TRIM(COALESCE(#{name}, '')))) DESC, id
        LIMIT 1
        """)
    Supplier findByNameOrAbn(@Param("name") String name, @Param("abn") String abn);

    @Select("""
        SELECT s.*
        FROM supplier s
        JOIN outlet o ON o.id=s.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        WHERE s.deleted_at IS NULL
          AND (
            (#{name} IS NOT NULL AND #{name} != '' AND (
                LOWER(TRIM(s.name)) = LOWER(TRIM(#{name}))
                OR (CHAR_LENGTH(TRIM(#{name})) >= 4 AND LOWER(s.name) LIKE CONCAT('%', LOWER(TRIM(#{name})), '%'))
            ))
            OR (#{abn} IS NOT NULL AND #{abn} != ''
                AND REPLACE(COALESCE(s.business_number, ''), ' ', '') = REPLACE(#{abn}, ' ', ''))
          )
        ORDER BY (LOWER(TRIM(s.name)) = LOWER(TRIM(COALESCE(#{name}, '')))) DESC, s.id
        LIMIT 2
        """)
    List<Supplier> findMatchesByNameOrAbnForVendor(@Param("name") String name,
                                                    @Param("abn") String abn,
                                                    @Param("vendorId") Long vendorId);

    @Select("""
        SELECT s.id, s.name, s.mdb_id, s.status, s.contact_id, s.business_number, s.account_number,
               s.order_notes, s.internal_order_notes, s.order_automatic_email, s.default_order_tax,
               s.email_format, s.comments, s.fee_amount, s.distribute_fees, s.distribute_freight,
               s.freight_included_on_invoices, s.freight_tax_id, s.fees_tax_id,
               s.allow_order_below_minimum, s.minimum_order_value, s.maximum_order_value,
               s.default_days_until_due, s.freight_fixed_cost_per_case,
               ct.email, ct.fax, ct.phone, ct.mobile, ct.website, ct.twitter, ct.facebook,
               ct.address_street1 AS street_address1,
               ct.address_street2 AS street_address2,
               ct.address_suburb AS suburb,
               ct.address_city AS city,
               ct.address_postcode AS post_code,
               ct.address_region AS region,
               ct.address_country AS country
        FROM supplier s
        LEFT JOIN contact ct ON ct.id = s.contact_id
        WHERE s.id = #{id} AND s.deleted_at IS NULL
        """)
    SupplierDetail findDetailById(Long id);

    @Select("""
        SELECT s.*, ct.email, ct.fax, ct.phone, ct.mobile, ct.website, ct.twitter, ct.facebook,
               ct.address_street1 AS street_address1, ct.address_street2 AS street_address2,
               ct.address_suburb AS suburb, ct.address_city AS city,
               ct.address_postcode AS post_code, ct.address_region AS region,
               ct.address_country AS country
        FROM supplier s
        JOIN outlet o ON o.id=s.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        LEFT JOIN contact ct ON ct.id=s.contact_id
        WHERE s.id=#{id} AND s.deleted_at IS NULL
        """)
    SupplierDetail findDetailByIdAndVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO supplier (outlet_id, name, mdb_id, status, contact_id, business_number, account_number,
                              order_notes, internal_order_notes, order_automatic_email, default_order_tax,
                              email_format, comments, fee_amount, distribute_fees, distribute_freight,
                              freight_included_on_invoices, freight_tax_id, fees_tax_id,
                              allow_order_below_minimum, minimum_order_value, maximum_order_value,
                              default_days_until_due, freight_fixed_cost_per_case)
        VALUES (#{outletId}, #{name}, #{mdbId}, #{status}, #{contactId}, #{businessNumber}, #{accountNumber},
                #{orderNotes}, #{internalOrderNotes}, #{orderAutomaticEmail}, #{defaultOrderTax},
                #{emailFormat}, #{comments}, #{feeAmount}, #{distributeFees}, #{distributeFreight},
                #{freightIncludedOnInvoices}, #{freightTaxId}, #{feesTaxId},
                #{allowOrderBelowMinimum}, #{minimumOrderValue}, #{maximumOrderValue},
                #{defaultDaysUntilDue}, #{freightFixedCostPerCase})
        """)
    int insertDetail(SupplierDetail s);

    @Update("""
        UPDATE supplier SET name=#{name}, mdb_id=#{mdbId}, status=#{status}, contact_id=#{contactId},
               business_number=#{businessNumber}, account_number=#{accountNumber},
               order_notes=#{orderNotes}, internal_order_notes=#{internalOrderNotes},
               order_automatic_email=#{orderAutomaticEmail}, default_order_tax=#{defaultOrderTax},
               email_format=#{emailFormat}, comments=#{comments}, fee_amount=#{feeAmount},
               distribute_fees=#{distributeFees}, distribute_freight=#{distributeFreight},
               freight_included_on_invoices=#{freightIncludedOnInvoices},
               freight_tax_id=#{freightTaxId}, fees_tax_id=#{feesTaxId},
               allow_order_below_minimum=#{allowOrderBelowMinimum},
               minimum_order_value=#{minimumOrderValue}, maximum_order_value=#{maximumOrderValue},
               default_days_until_due=#{defaultDaysUntilDue},
               freight_fixed_cost_per_case=#{freightFixedCostPerCase}
        WHERE id=#{id} AND outlet_id=#{outletId}
        """)
    int updateDetail(SupplierDetail s);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO supplier (name, mdb_id, status, business_number, account_number, "
            + "order_notes, comments, minimum_order_value, default_days_until_due) "
            + "VALUES (#{name}, #{mdbId}, #{status}, #{businessNumber}, #{accountNumber}, "
            + "#{orderNotes}, #{comments}, #{minimumOrderValue}, #{defaultDaysUntilDue})")
    int insert(Supplier s);

    @Update("UPDATE supplier SET name=#{name}, status=#{status}, business_number=#{businessNumber}, "
            + "account_number=#{accountNumber}, order_notes=#{orderNotes}, comments=#{comments} WHERE id=#{id}")
    int update(Supplier s);

    @Update("UPDATE supplier SET deleted_at = NOW() WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int softDelete(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Update("UPDATE product SET core_supplier_id=#{target} WHERE core_supplier_id=#{source} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reassignProductCoreSupplier(@Param("target") Long target, @Param("source") Long source,
                                    @Param("vendorId") Long vendorId);

    @Update("UPDATE product_supplier SET supplier_id=#{target} WHERE supplier_id=#{source} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reassignProductSupplier(@Param("target") Long target, @Param("source") Long source,
                                @Param("vendorId") Long vendorId);

    @Update("UPDATE purchase_order SET from_id=#{target} WHERE from_id=#{source} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reassignOrderFrom(@Param("target") Long target, @Param("source") Long source,
                          @Param("vendorId") Long vendorId);

    @Update("UPDATE order_product SET supplier_id=#{target} WHERE supplier_id=#{source} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reassignOrderProductSupplier(@Param("target") Long target, @Param("source") Long source,
                                     @Param("vendorId") Long vendorId);

    @Update("UPDATE future_cost SET supplier_id=#{target} WHERE supplier_id=#{source} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reassignFutureCostSupplier(@Param("target") Long target, @Param("source") Long source,
                                   @Param("vendorId") Long vendorId);
}
