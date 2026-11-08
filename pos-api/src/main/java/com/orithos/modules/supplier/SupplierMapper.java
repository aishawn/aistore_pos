package com.orithos.modules.supplier;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SupplierMapper {

    @Select("""
        SELECT s.*, (
            SELECT COUNT(DISTINCT ps.product_id)
            FROM product_supplier ps
            INNER JOIN product p ON p.id = ps.product_id AND p.deleted_at IS NULL
            WHERE ps.supplier_id = s.id
        ) AS product_count
        FROM supplier s
        WHERE (s.deleted_at IS NULL OR EXISTS (
            SELECT 1 FROM product_supplier ps
            INNER JOIN product p ON p.id = ps.product_id AND p.deleted_at IS NULL
            WHERE ps.supplier_id = s.id
        ))
          AND (CAST(#{name} AS TEXT) IS NULL OR s.name LIKE CONCAT('%', CAST(#{name} AS TEXT), '%'))
        ORDER BY s.id DESC
        LIMIT #{size} OFFSET #{offset}
        """)
    List<Supplier> page(@Param("name") String name, @Param("size") int size, @Param("offset") int offset);

    @Select("""
        SELECT COUNT(*) FROM supplier s
        WHERE (s.deleted_at IS NULL OR EXISTS (
            SELECT 1 FROM product_supplier ps
            INNER JOIN product p ON p.id = ps.product_id AND p.deleted_at IS NULL
            WHERE ps.supplier_id = s.id
        ))
          AND (CAST(#{name} AS TEXT) IS NULL OR s.name LIKE CONCAT('%', CAST(#{name} AS TEXT), '%'))
        """)
    long count(@Param("name") String name);

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

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO supplier (name, mdb_id, status, contact_id, business_number, account_number,
                              order_notes, internal_order_notes, order_automatic_email, default_order_tax,
                              email_format, comments, fee_amount, distribute_fees, distribute_freight,
                              freight_included_on_invoices, freight_tax_id, fees_tax_id,
                              allow_order_below_minimum, minimum_order_value, maximum_order_value,
                              default_days_until_due, freight_fixed_cost_per_case)
        VALUES (#{name}, #{mdbId}, #{status}, #{contactId}, #{businessNumber}, #{accountNumber},
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
        WHERE id=#{id}
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

    @Update("UPDATE supplier SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Update("UPDATE product SET core_supplier_id=#{target} WHERE core_supplier_id=#{source}")
    int reassignProductCoreSupplier(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE product_supplier SET supplier_id=#{target} WHERE supplier_id=#{source}")
    int reassignProductSupplier(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE purchase_order SET from_id=#{target} WHERE from_id=#{source}")
    int reassignOrderFrom(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE order_product SET supplier_id=#{target} WHERE supplier_id=#{source}")
    int reassignOrderProductSupplier(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE future_cost SET supplier_id=#{target} WHERE supplier_id=#{source}")
    int reassignFutureCostSupplier(@Param("target") Long target, @Param("source") Long source);
}
